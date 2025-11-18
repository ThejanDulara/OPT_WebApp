from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import pandas as pd
#import pulp
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, PULP_CBC_CMD,LpInteger
from pulp import LpStatus
import os
import json
import time
from flask import send_file
from collections import defaultdict

app = Flask(__name__)
CORS(app)  # Enable CORS for communication with React frontend


# === Database Connection ===
def get_db_connection():
    return mysql.connector.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASS", ""),
        database=os.environ.get("DB_NAME", "optimization"),
        autocommit=True
    )

# === Routes ===

@app.route('/')
def home():
    return jsonify({"message": "Welcome to the Optimization API"})


@app.route('/channels', methods=['GET'])
def get_channels():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT channel FROM programs ORDER BY channel ASC;")
    rows = cursor.fetchall()
    conn.close()

    channels = [row[0] for row in rows]
    return jsonify({"channels": channels})


@app.route('/all-programs', methods=['GET'])
def get_all_programs():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM programs ORDER BY channel, slot, program;")
    programs = cursor.fetchall()
    conn.close()
    return jsonify({"programs": programs})


@app.route('/programs', methods=['GET'])
def get_programs():
    channel = request.args.get('channel')
    if not channel:
        return jsonify({"error": "Channel parameter is required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM programs WHERE channel = %s;", (channel,))
    programs = cursor.fetchall()
    conn.close()

    return jsonify({"programs": programs})


@app.route('/generate-df', methods=['POST'])
def generate_df():
    data = request.get_json()

    program_ids = data.get('program_ids', [])
    tg = data.get("target_group", "tvr_all")
    num_commercials = data.get('num_commercials')
    durations = data.get('durations')

    negotiated_rates = data.get('negotiated_rates', {})     # { programId: value }
    channel_discounts = data.get('channel_discounts', {})   # { channel: pct }

    ALLOWED_TGS = [
        "tvr_all",
        "tvr_abc_15_90",
        "tvr_abc_30_60",
        "tvr_abc_15_30",
        "tvr_abc_20_plus",
        "tvr_ab_15_plus",
        "tvr_cd_15_plus",
        "tvr_ab_female_15_45",
        "tvr_abc_15_60",
        "tvr_bcde_15_plus",
        "tvr_abcde_15_plus",
        "tvr_abc_female_15_60",
        "tvr_abc_male_15_60",
    ]

    if tg not in ALLOWED_TGS:
        tg = "tvr_all"

    if not program_ids or not num_commercials or not durations:
        return jsonify({"error": "Missing required data"}), 400

    # 1) Fetch selected programs from DB (include id so overrides work)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    fmt = ','.join(['%s'] * len(program_ids))
    cursor.execute(f"SELECT id, channel, day, time, program, cost, {tg} AS tvr, slot FROM programs WHERE id IN ({fmt})", tuple(program_ids))
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return jsonify({"error": "No programs found for given IDs"}), 400

    # 2) Build df directly from dict rows (no custom columns list)
    df = pd.DataFrame(rows)

    # Standardize column names
    df.rename(columns={
        'id': 'Id',
        'channel': 'Channel',
        'day': 'Day',
        'time': 'Time',
        'program': 'Program',
        'cost': 'Cost',
        'tvr': 'TVR',
        'slot': 'Slot'
    }, inplace=True)

    # Ensure numeric
    df['Cost'] = pd.to_numeric(df['Cost'], errors='coerce').fillna(0.0)
    df['TVR']  = pd.to_numeric(df['TVR'],  errors='coerce').fillna(0.0)

    # 3) Effective/Negotiated rate
    def effective_cost(row):
        pid = row['Id']
        ch  = row['Channel']
        base = float(row['Cost'])
        if pid in negotiated_rates and negotiated_rates[pid] is not None:
            return float(negotiated_rates[pid])
        disc_pct = float(channel_discounts.get(ch, 30.0))
        return round(base * (1.0 - disc_pct / 100.0), 2)

    df['Negotiated_Rate'] = df.apply(effective_cost, axis=1)

    # 4) Expand by commercials; compute NTVR/NCost
    df_list = []
    for c in range(int(num_commercials)):
        temp = df.copy()
        temp['Commercial'] = c
        duration = float(durations[c])
        temp['NTVR']  = (temp['TVR'] / 30.0) * duration
        temp['NCost'] = (temp['Negotiated_Rate'] / 30.0) * duration
        df_list.append(temp)

    df_full = pd.concat(df_list, ignore_index=True)
    cols_to_round = ['Cost', 'TVR', 'Negotiated_Rate', 'NTVR', 'NCost']
    for col in cols_to_round:
        df_full[col] = pd.to_numeric(df_full[col], errors='coerce').fillna(0.0).round(2)

    return jsonify({"df_full": json.loads(df_full.to_json(orient='records'))})

@app.route('/generate-bonus-df', methods=['POST'])
def generate_bonus_df():
    """
    Generate the bonus optimization-ready DataFrame
    using the same normalization logic as /generate-df.
    Avoids duplicates and ensures consistent scaling.
    """
    data = request.get_json()

    # Selected program IDs for Slot B
    program_ids = data.get('program_ids', [])
    durations = data.get('durations', [])
    num_commercials = len(durations)
    negotiated_rates = data.get('negotiated_rates', {})
    channel_discounts = data.get('channel_discounts', {})

    if not program_ids or not durations:
        return jsonify({"error": "Missing program_ids or durations"}), 400

    # 🔁 Reuse existing generate_df logic (inline version)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    fmt = ','.join(['%s'] * len(program_ids))
    cursor.execute(f"SELECT id, channel, day, time, program, cost, tvr, slot FROM programs WHERE id IN ({fmt})", tuple(program_ids))
    rows = cursor.fetchall()
    conn.close()
    if not rows:
        return jsonify({"error": "No programs found for given IDs"}), 400

    df = pd.DataFrame(rows)
    df.rename(columns={
        'id': 'Id',
        'channel': 'Channel',
        'day': 'Day',
        'time': 'Time',
        'program': 'Program',
        'cost': 'Cost',
        'tvr': 'TVR',
        'slot': 'Slot'
    }, inplace=True)

    df['Cost'] = pd.to_numeric(df['Cost'], errors='coerce').fillna(0.0)
    df['TVR'] = pd.to_numeric(df['TVR'], errors='coerce').fillna(0.0)

    def effective_cost(row):
        pid = row['Id']
        ch = row['Channel']
        base = float(row['Cost'])
        if pid in negotiated_rates:
            return float(negotiated_rates[pid])
        disc_pct = float(channel_discounts.get(ch, 30.0))
        return round(base * (1.0 - disc_pct / 100.0), 2)

    df['Negotiated_Rate'] = df.apply(effective_cost, axis=1)

    df_list = []
    for c in range(num_commercials):
        temp = df.copy()
        temp['Commercial'] = f"com_{c+1}"
        dur = float(durations[c])
        temp['Duration'] = dur
        temp['NTVR'] = (temp['TVR'] / 30.0) * dur
        temp['NCost'] = (temp['Negotiated_Rate'] / 30.0) * dur
        temp['Slot'] = 'B'
        df_list.append(temp)

    df_full = pd.concat(df_list, ignore_index=True)
    df_full = df_full.drop_duplicates(subset=['Channel', 'Program', 'Day', 'Time', 'Commercial'])

    cols_to_round = ['Cost', 'TVR', 'Negotiated_Rate', 'NTVR', 'NCost']
    for col in cols_to_round:
        df_full[col] = pd.to_numeric(df_full[col], errors='coerce').fillna(0.0).round(2)

    return jsonify({"success": True, "df_full": json.loads(df_full.to_json(orient='records'))})


@app.route('/optimize', methods=['POST'])
def run_optimization():
    data = request.get_json()
    df_full = pd.DataFrame(data.get('df_full'))
    total_budget = data.get('budget')
    budget_bound = data.get('budget_bound')
    min_spots = data.get('min_spots')
    max_spots = data.get('max_spots')
    num_commercials = data.get('num_commercials')

    if df_full.empty:
        return jsonify({"error": "df_full is empty"}), 400

    prob = LpProblem("Maximize_TVR", LpMaximize)
    x = {i: LpVariable(f"x_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    total_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost >= total_budget - budget_bound
    prob += total_cost <= total_budget + budget_bound

    budget_proportions = data.get("budget_proportions", [])
    if num_commercials > 1 and budget_proportions:
        for c in range(num_commercials):
            indices = df_full[df_full['Commercial'] == c].index
            commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            share = budget_proportions[c] / 100
            prob += commercial_cost >= (share - 0.05) * total_budget
            prob += commercial_cost <= (share + 0.05) * total_budget

    time_limit = data.get("time_limit", 120)  # in seconds, default to 120 if not provided
    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit)
    prob.solve(solver)
    if prob.status != 1:
        return jsonify({
            "success": False,
            "message": "⚠️ Optimization failed — no feasible solution found. Please check constraints or budget."
        }), 200

    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

    # Round values
    df_full[['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']] = df_full[[
        'Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating'
    ]].round(2)

    # Filter out zero spots
    df_full = df_full[df_full['Spots'] > 0].copy()

    # Commercial-wise summary
    commercials_summary = []
    for c in range(num_commercials):
        df_c = df_full[df_full['Commercial'] == c].copy()
        if df_c.empty:
            continue

        df_c['Slot_Order'] = df_c['Slot'].map({'A': 0, 'B': 1})
        df_c = df_c.sort_values(by=['Channel', 'Slot_Order', 'Program']).drop(columns='Slot_Order')

        total_cost_c = df_c['Total_Cost'].sum()
        total_rating_c = df_c['Total_Rating'].sum()
        cprp_c = total_cost_c / total_rating_c if total_rating_c else None

        details_safe = json.loads(df_c.to_json(orient='records'))

        commercials_summary.append({
            "commercial_index": c,
            "total_cost": round(total_cost_c, 2),
            "total_rating": round(total_rating_c, 2),
            "cprp": round(cprp_c, 2) if cprp_c else None,
            #"details": df_c.to_dict(orient='records')
            "details": details_safe
        })

    # Channel summary
    channel_summary = df_full.groupby('Channel')['Total_Cost'].sum().reset_index()
    total_cost_all = df_full['Total_Cost'].sum()
    channel_summary['% of Total'] = (channel_summary['Total_Cost'] / total_cost_all * 100).round(2)

    return jsonify({
        "success": True,
        "total_cost": float(round(total_cost_all, 2)),
        "total_rating": float(round(df_full['Total_Rating'].sum(), 2)),
        "cprp": float(round(total_cost_all / df_full['Total_Rating'].sum(), 2)) if df_full['Total_Rating'].sum() else None,
        "commercials_summary": commercials_summary,
        "channel_summary": json.loads(channel_summary.to_json(orient='records')),
        "df_result": json.loads(df_full.to_json(orient='records'))
    })


@app.route('/programs/<channel>', methods=['GET'])
def get_programs_by_channel(channel):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT day, time, program, cost, tvr, slot FROM programs WHERE channel = %s", (channel,))
    programs = cursor.fetchall()
    conn.close()
    return jsonify({'programs': programs})


@app.route('/create-channel', methods=['POST'])
def create_channel():
    data = request.get_json()
    name = data.get('name')
    # Nothing to do — handled when inserting programs later
    return jsonify({'message': f'Channel "{name}" initialized (placeholder)'})


@app.route('/update-programs', methods=['POST'])
def update_programs():
    data = request.get_json()
    channel = data['channel']
    programs = data['programs']

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM programs WHERE channel = %s", (channel,))

    for p in programs:
        cursor.execute(
            """
            INSERT INTO programs (
                channel, day, time, program, cost, slot,
                tvr_all,
                tvr_abc_15_90,
                tvr_abc_30_60,
                tvr_abc_15_30,
                tvr_abc_20_plus,
                tvr_ab_15_plus,
                tvr_cd_15_plus,
                tvr_ab_female_15_45,
                tvr_abc_15_60,
                tvr_bcde_15_plus,
                tvr_abcde_15_plus,
                tvr_abc_female_15_60,
                tvr_abc_male_15_60
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s
            )
            """,
            (
                channel,
                p.get('day'),
                p.get('time'),
                p.get('program'),
                p.get('cost'),
                p.get('slot'),

                p.get('tvr_all'),
                p.get('tvr_abc_15_90'),
                p.get('tvr_abc_30_60'),
                p.get('tvr_abc_15_30'),
                p.get('tvr_abc_20_plus'),
                p.get('tvr_ab_15_plus'),
                p.get('tvr_cd_15_plus'),
                p.get('tvr_ab_female_15_45'),
                p.get('tvr_abc_15_60'),
                p.get('tvr_bcde_15_plus'),
                p.get('tvr_abcde_15_plus'),
                p.get('tvr_abc_female_15_60'),
                p.get('tvr_abc_male_15_60'),
            )
        )

    conn.commit()
    conn.close()
    return jsonify({'message': 'Programs updated'})

@app.route('/export-all-programs', methods=['GET'])
def export_all_programs():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM programs ORDER BY channel, slot, program;")
    rows = cursor.fetchall()
    conn.close()

    df = pd.DataFrame(rows)

    # Save to temporary file
    file_path = "/tmp/all_programs.xlsx"
    df.to_excel(file_path, index=False)

    # IMPORTANT: Use send_file to avoid corruption
    return send_file(
        file_path,
        as_attachment=True,
        download_name="all_programs.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@app.route('/delete-program', methods=['POST'])
def delete_program():
    data = request.get_json()
    channel = data['channel']
    program = data['program']
    slot = data['slot']

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM programs WHERE channel = %s AND program = %s AND slot = %s LIMIT 1",
        (channel, program, slot)
    )
    conn.commit()
    conn.close()

    return jsonify({'message': 'Program deleted'})


@app.route('/optimize-by-budget-share', methods=['POST'])
def optimize_by_budget_share():
    data = request.get_json()
    df_full = pd.DataFrame(data.get('df_full'))
    budget_shares = data.get('budget_shares') or {}
    total_budget = float(data.get('budget', 0))
    budget_bound = float(data.get('budget_bound', 0))
    num_commercials = int(data.get('num_commercials', 1))
    min_spots = int(data.get('min_spots', 0))
    max_spots = int(data.get('max_spots', 10))
    prime_pct_global = float(data.get('prime_pct', 80))
    nonprime_pct_global = float(data.get('nonprime_pct', 20))
    time_limit = int(data.get("time_limit", 120))

    # NEW: optional per-channel maps
    prime_map = data.get('channel_prime_pct_map') or {}
    nonprime_map = data.get('channel_nonprime_pct_map') or {}

    if df_full.empty or not budget_shares:
        return jsonify({"error": "Missing data"}), 400

    # Safety: ensure required columns exist (Slot must be 'A'/'B')
    required_cols = {'NCost', 'NTVR', 'Channel', 'Slot'}
    missing = required_cols - set(df_full.columns)
    if missing:
        return jsonify({"error": f"Missing columns in df_full: {sorted(missing)}"}), 400

    prob = LpProblem("Maximize_TVR_With_Channel_and_Slot_Budget_Shares", LpMaximize)
    x = {i: LpVariable(f"x2_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    # Objective: maximize NTVR * spots
    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    # Total budget constraint
    total_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost_expr >= total_budget - budget_bound
    prob += total_cost_expr <= total_budget + budget_bound

    # Optional: commercial-level budget proportions (±5% tolerance)
    budget_proportions = data.get("budget_proportions", [])
    if budget_proportions:
        # If 'Commercial' column is required for this, ensure present
        if 'Commercial' not in df_full.columns:
            return jsonify({"error": "budget_proportions provided, but 'Commercial' column missing"}), 400
        for c in range(min(len(budget_proportions), num_commercials)):
            indices = df_full[df_full['Commercial'] == c].index
            if len(indices) == 0:
                continue
            commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            share = float(budget_proportions[c]) / 100.0
            prob += commercial_cost >= (share - 0.05) * total_budget
            prob += commercial_cost <= (share + 0.05) * total_budget

    # Channel-specific budget and PT/NPT constraints
    for ch, pct in budget_shares.items():
        ch_indices = df_full[df_full['Channel'] == ch].index
        if len(ch_indices) == 0:
            # Skip constraints if the channel has no rows in df_full
            continue

        ch_budget = (float(pct) / 100.0) * total_budget
        ch_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in ch_indices)

        # Keep channel budget within ±5%
        prob += ch_cost >= 0.95 * ch_budget
        prob += ch_cost <= 1.05 * ch_budget

        # PT / NPT sets
        prime_indices = df_full[(df_full['Channel'] == ch) & (df_full['Slot'].str.startswith('A', na=False))].index
        nonprime_indices = df_full[(df_full['Channel'] == ch) & (df_full['Slot'] == 'B')].index

        prime_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in prime_indices) if len(prime_indices) else 0
        nonprime_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in nonprime_indices) if len(nonprime_indices) else 0

        # NEW: prefer per-channel splits; fallback to global if invalid or not provided
        ch_prime_pct = float(prime_map.get(ch, prime_pct_global))
        ch_nonprime_pct = float(nonprime_map.get(ch, nonprime_pct_global))
        if abs(ch_prime_pct + ch_nonprime_pct - 100.0) > 0.01:
            # Fallback to global if user-provided split is invalid
            ch_prime_pct = prime_pct_global
            ch_nonprime_pct = nonprime_pct_global

        # ±5% tolerance around the desired channel PT/NPT budgets
        prob += prime_cost >= ((ch_prime_pct / 100.0) - 0.05) * ch_budget
        prob += prime_cost <= ((ch_prime_pct / 100.0) + 0.05) * ch_budget
        prob += nonprime_cost >= ((ch_nonprime_pct / 100.0) - 0.05) * ch_budget
        prob += nonprime_cost <= ((ch_nonprime_pct / 100.0) + 0.05) * ch_budget

    # Use CBC with (optional) log files
    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit, keepFiles=True)

    # Measure elapsed time to detect time-limit finishes reliably
    start_ts = time.time()
    prob.solve(solver)
    elapsed = time.time() - start_ts

    # --- Detect time-limit via logs (if present) ---
    hit_time_limit_log = False
    try:
        log_file = f"{prob.name}.log"
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                log_txt = f.read().lower()
            if "stopped on time limit" in log_txt or "time limit reached" in log_txt:
                hit_time_limit_log = True
    except Exception:
        pass  # ignore log read issues

    # --- Detect time-limit via elapsed time (robust, no logs needed) ---
    hit_time_limit_elapsed = elapsed >= max(time_limit - 1.0, 0.95 * time_limit)

    # Combine both signals
    hit_time_limit = hit_time_limit_log or hit_time_limit_elapsed

    status_str = LpStatus[prob.status]  # 'Optimal', 'Not Solved', 'Infeasible', 'Unbounded', 'Undefined'
    has_solution = any((v.varValue is not None and v.varValue > 0) for v in x.values())

    # Only call it optimal if solver says Optimal AND we did NOT hit the time limit
    is_optimal = (status_str == 'Optimal') and (not hit_time_limit)

    # Treat time-limit or 'Not Solved' as feasible-but-not-proven-optimal (given we have an incumbent)
    feasible_but_not_optimal = (status_str == 'Not Solved') or hit_time_limit

    # Fail fast on solver-declared bad statuses
    if status_str in ('Infeasible', 'Unbounded', 'Undefined'):
        return jsonify({
            "success": False,
            "message": f"⚠️ No feasible solution. Solver status: {status_str}",
            "solver_status": status_str
        }), 200

    # If no incumbent at all, also fail
    if not has_solution:
        return jsonify({
            "success": False,
            "message": "⚠️ No feasible solution found (no incumbent).",
            "solver_status": status_str
        }), 200

    #feasible_but_not_optimal = (not is_optimal and status_str in ('Not Solved',))

    # Build result dataframe
    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

    # Round and filter
    cols_to_round = ['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']
    for c in (set(cols_to_round) & set(df_full.columns)):
        df_full[c] = df_full[c].astype(float).round(2)
    df_full = df_full[df_full['Spots'] > 0].copy()

    # Commercials summary (if column present)
    commercials_summary = []
    if 'Commercial' in df_full.columns:
        for c in range(num_commercials):
            df_c = df_full[df_full['Commercial'] == c].copy()
            if df_c.empty:
                continue
            # Preserve PT before NPT inside each channel
            df_c['Slot_Order'] = df_c['Slot'].map({'A': 0, 'B': 1}).fillna(2)
            df_c = df_c.sort_values(by=['Channel', 'Slot_Order', 'Program']).drop(columns='Slot_Order', errors='ignore')

            total_cost_c = df_c['Total_Cost'].sum()
            total_rating_c = df_c['Total_Rating'].sum()
            cprp_c = (total_cost_c / total_rating_c) if total_rating_c else None

            commercials_summary.append({
                "commercial_index": c,
                "total_cost": round(total_cost_c, 2),
                "total_rating": round(total_rating_c, 2),
                "cprp": round(cprp_c, 2) if cprp_c else None,
                "details": df_c.to_dict(orient='records')
            })

    total_rating = float(df_full['Total_Rating'].sum())
    total_cost_all = float(df_full['Total_Cost'].sum())

    # Channel summary
    channel_summary = []
    for ch in df_full['Channel'].unique():
        df_ch = df_full[df_full['Channel'] == ch]
        ch_cost = float(df_ch['Total_Cost'].sum())
        ch_rating = float(df_ch['Total_Rating'].sum())
        ch_prime = df_ch[df_ch['Slot'].str.startswith('A', na=False)]
        ch_nonprime = df_ch[df_ch['Slot'] == 'B']
        prime_cost_val = float(ch_prime['Total_Cost'].sum())
        nonprime_cost_val = float(ch_nonprime['Total_Cost'].sum())
        prime_rating_val = float(ch_prime['Total_Rating'].sum())
        nonprime_rating_val = float(ch_nonprime['Total_Rating'].sum())

        channel_summary.append({
            'Channel': ch,
            'Total_Cost': round(ch_cost, 2),
            '% Cost': round((ch_cost / total_cost_all * 100), 2) if total_cost_all else 0,
            'Total_Rating': round(ch_rating, 2),
            '% Rating': round((ch_rating / total_rating * 100), 2) if total_rating else 0,
            'Prime Cost': round(prime_cost_val, 2),
            'Non-Prime Cost': round(nonprime_cost_val, 2),
            'Prime Rating': round(prime_rating_val, 2),
            'Non-Prime Rating': round(nonprime_rating_val, 2),
            'Prime Cost %': round((prime_cost_val / ch_cost * 100), 2) if ch_cost else 0,
            'Non-Prime Cost %': round((nonprime_cost_val / ch_cost * 100), 2) if ch_cost else 0
        })
    #feasible_but_not_optimal = has_solution and not is_optimal
    """return jsonify({
        "success": True,
        "total_cost": float(round(total_cost_all, 2)),
        "total_rating": float(round(total_rating, 2)),
        "cprp": float(round(total_cost_all / total_rating, 2)) if total_rating else None,
        "channel_summary": channel_summary.to_dict(orient="records") if hasattr(channel_summary,
                                                                                "to_dict") else channel_summary,
        #"channel_summary": json.loads(channel_summary.to_json(orient='records')),

        "commercials_summary": [dict(c) for c in commercials_summary] if isinstance(commercials_summary,
                                                                                    list) else commercials_summary,
        #"df_result": df_full.to_dict(orient="records"),
        "df_result": json.loads(df_full.to_json(orient='records')),
        "is_optimal": bool(is_optimal),
        "feasible_but_not_optimal": bool(feasible_but_not_optimal),
        "solver_status": str(LpStatus[prob.status])
    }), 200"""

    return jsonify({
        "success": True,
        "total_cost": float(round(total_cost_all, 2)),
        "total_rating": float(round(total_rating, 2)),
        "cprp": float(round(total_cost_all / total_rating, 2)) if total_rating else None,

        # channel_summary is already a Python list of dicts → return as-is
        "channel_summary": channel_summary,

        # commercials_summary.details comes from a DataFrame → convert safely
        "commercials_summary": [
            {
                **{k: v for k, v in c.items() if k != "details"},
                "details": json.loads(pd.DataFrame(c["details"]).to_json(orient="records"))
                if isinstance(c.get("details"), list) else json.loads(c["details"].to_json(orient="records"))
            }
            for c in commercials_summary
        ],

        # df_full is a DataFrame → convert safely
        "df_result": json.loads(df_full.to_json(orient="records")),

        "is_optimal": bool(is_optimal),
        "feasible_but_not_optimal": bool(feasible_but_not_optimal),
        "solver_status": str(LpStatus[prob.status]),
        "hit_time_limit": bool(hit_time_limit)
    }), 200

@app.route('/optimize-by-benefit-share', methods=['POST'])
def optimize_by_benefit_share():
    """
    Same as /optimize-by-budget-share, but expects budget_shares built
    from Commercial Benefit amounts. Constraints and objective are identical.
    """
    data = request.get_json()
    df_full = pd.DataFrame(data.get('df_full'))
    budget_shares = data.get('budget_shares') or {}
    benefit_channels = list(budget_shares.keys())
    df_full = df_full[df_full['Channel'].isin(benefit_channels)].copy()
    total_budget = float(data.get('budget', 0))
    budget_bound = float(data.get('budget_bound', 0))
    num_commercials = int(data.get('num_commercials', 1))
    min_spots = int(data.get('min_spots', 0))
    max_spots = int(data.get('max_spots', 10))
    prime_pct_global = float(data.get('prime_pct', 80))
    nonprime_pct_global = float(data.get('nonprime_pct', 20))
    time_limit = int(data.get("time_limit", 120))

    channel_slot_pct_map = data.get('channel_slot_pct_map') or {}

    if df_full.empty or not budget_shares:
        return jsonify({"error": "Missing data"}), 400

    required_cols = {'NCost', 'NTVR', 'Channel', 'Slot'}
    missing = required_cols - set(df_full.columns)
    if missing:
        return jsonify({"error": f"Missing columns in df_full: {sorted(missing)}"}), 400

    # --- Build problem (same as base endpoint) ---
    prob = LpProblem("Maximize_TVR_CommercialBenefit", LpMaximize)
    x = {i: LpVariable(f"x_ben_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    # Objective
    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    # Budget constraint
    total_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost_expr >= total_budget - budget_bound
    prob += total_cost_expr <= total_budget + budget_bound

    # Commercial-level proportions (optional)
    budget_proportions = data.get("budget_proportions", [])
    if budget_proportions and 'Commercial' in df_full.columns:
        for c in range(min(len(budget_proportions), num_commercials)):
            indices = df_full[df_full['Commercial'] == c].index
            if len(indices) == 0:
                continue
            commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            share = float(budget_proportions[c]) / 100.0
            prob += commercial_cost >= (share - 0.05) * total_budget
            prob += commercial_cost <= (share + 0.05) * total_budget

    from collections import defaultdict

    # Channel-specific constraints
    for ch, pct in budget_shares.items():
        ch_indices = df_full[df_full['Channel'] == ch].index
        if len(ch_indices) == 0:
            continue

        ch_budget = (float(pct) / 100.0) * total_budget
        ch_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in ch_indices)

        prob += ch_cost >= 0.95 * ch_budget
        prob += ch_cost <= 1.05 * ch_budget

        ch_slot_pcts = channel_slot_pct_map.get(ch, {'A': prime_pct_global, 'B': nonprime_pct_global})

        # Group by slot
        slot_indices = defaultdict(list)
        for i in ch_indices:
            slot = df_full.loc[i, 'Slot']
            slot_indices[slot].append(i)

        for slot, indices in slot_indices.items():
            if not indices:
                continue
            slot_pct = float(ch_slot_pcts.get(slot, 0))
            if slot_pct == 0:
                continue
            slot_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            lower = (slot_pct / 100.0) - 0.05
            upper = (slot_pct / 100.0) + 0.05
            prob += slot_cost >= lower * ch_budget
            prob += slot_cost <= upper * ch_budget

    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit, keepFiles=True)
    prob.solve(solver)

    status_str = LpStatus[prob.status]
    has_solution = any((v.varValue is not None and v.varValue > 0) for v in x.values())
    is_optimal = status_str == 'Optimal'
    feasible_but_not_optimal = status_str in ('Not Solved',)

    if status_str in ('Infeasible', 'Unbounded', 'Undefined') or not has_solution:
        return jsonify({
            "success": False,
            "message": f"⚠️ No feasible solution. Solver status: {status_str}",
            "solver_status": status_str
        }), 200

    # Results
    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

    cols_to_round = ['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']
    for c in (set(cols_to_round) & set(df_full.columns)):
        df_full[c] = df_full[c].astype(float).round(2)
    df_full = df_full[df_full['Spots'] > 0].copy()

    # Commercials summary
    commercials_summary = []
    if 'Commercial' in df_full.columns:
        for c in range(num_commercials):
            df_c = df_full[df_full['Commercial'] == c].copy()
            if df_c.empty: continue
            total_cost_c = df_c['Total_Cost'].sum()
            total_rating_c = df_c['Total_Rating'].sum()
            cprp_c = (total_cost_c / total_rating_c) if total_rating_c else None
            commercials_summary.append({
                "commercial_index": c,
                "total_cost": round(total_cost_c, 2),
                "total_rating": round(total_rating_c, 2),
                "cprp": round(cprp_c, 2) if cprp_c else None,
                "details": df_c.to_dict(orient='records')
            })

    # Channel summary with detailed slot breakdown
    channel_summary = []
    total_cost_all = float(df_full['Total_Cost'].sum())
    total_rating = float(df_full['Total_Rating'].sum())

    for ch in df_full['Channel'].unique():
        df_ch = df_full[df_full['Channel'] == ch]
        ch_cost = float(df_ch['Total_Cost'].sum())
        ch_rating = float(df_ch['Total_Rating'].sum())

        # Default slots
        prime_cost = nonprime_cost = 0
        a1_cost = a2_cost = a3_cost = a4_cost = a5_cost = b_cost = 0

        if ch == 'HIRU TV':
            a1_cost = float(df_ch[df_ch['Slot'] == 'A1']['Total_Cost'].sum())
            a2_cost = float(df_ch[df_ch['Slot'] == 'A2']['Total_Cost'].sum())
            a3_cost = float(df_ch[df_ch['Slot'] == 'A3']['Total_Cost'].sum())
            a4_cost = float(df_ch[df_ch['Slot'] == 'A4']['Total_Cost'].sum())
            a5_cost = float(df_ch[df_ch['Slot'] == 'A5']['Total_Cost'].sum())
            b_cost = float(df_ch[df_ch['Slot'] == 'B']['Total_Cost'].sum())
            prime_cost = a1_cost + a2_cost + a3_cost + a4_cost + a5_cost
            nonprime_cost = b_cost
        else:
            prime_cost = float(df_ch[df_ch['Slot'] == 'A']['Total_Cost'].sum())
            nonprime_cost = float(df_ch[df_ch['Slot'] == 'B']['Total_Cost'].sum())

        channel_summary.append({
            'Channel': ch,
            'Total_Cost': round(ch_cost, 2),
            '% Cost': round((ch_cost / total_cost_all * 100), 2) if total_cost_all else 0,
            'Total_Rating': round(ch_rating, 2),
            '% Rating': round((ch_rating / total_rating * 100), 2) if total_rating else 0,
            'Prime Cost': round(prime_cost, 2),
            'Non-Prime Cost': round(nonprime_cost, 2),
            'Prime Rating': round(
                float(df_ch[df_ch['Slot'].isin(['A', 'A1', 'A2', 'A3', 'A4', 'A5'])]['Total_Rating'].sum()), 2),
            'Non-Prime Rating': round(float(df_ch[df_ch['Slot'] == 'B']['Total_Rating'].sum()), 2),

            # NEW: HIRU TV sub-slots
            'A1 Cost': round(a1_cost, 2),
            'A2 Cost': round(a2_cost, 2),
            'A3 Cost': round(a3_cost, 2),
            'A4 Cost': round(a4_cost, 2),
            'A5 Cost': round(a5_cost, 2),
            'B Cost': round(b_cost, 2),
        })

    return jsonify({
        "success": True,
        "total_cost": float(round(total_cost_all, 2)),
        "total_rating": float(round(total_rating, 2)),
        "cprp": float(round(total_cost_all / total_rating, 2)) if total_rating else None,
        "channel_summary": channel_summary,
        "commercials_summary": commercials_summary,
        "df_result": json.loads(df_full.to_json(orient="records")),
        "is_optimal": bool(is_optimal),
        "feasible_but_not_optimal": bool(feasible_but_not_optimal),
        "solver_status": str(status_str)
    }), 200


@app.route('/optimize-bonus', methods=['POST'])
def optimize_bonus():
    data = request.get_json()

    # Map frontend → backend names
    df_full = pd.DataFrame(data.get('df_full') or data.get('programRows'))
    bonus_budgets = data.get('bonus_budgets') or data.get('bonusBudgetsByChannel')
    channel_bounds = data.get('channel_bounds') or data.get('channelAllowPctByChannel')
    commercial_budgets = data.get('commercial_budgets') or data.get('commercialTargetsByChannel')
    min_spots = data.get('min_spots', 0)
    max_spots = data.get('max_spots') or data.get('maxSpots', 20)
    time_limit = data.get('time_limit') or data.get('timeLimitSec', 120)

    if df_full.empty:
        return jsonify({"success": False, "message": "⚠️ df_full/programRows is empty"}), 400

    results = []
    for channel in df_full['Channel'].unique():
        df_ch = df_full[df_full['Channel'] == channel].copy()
        bonus_budget = bonus_budgets.get(channel, 0)
        budget_bound = channel_bounds.get(channel, 0)
        comm_budgets = commercial_budgets.get(channel, {})

        # set up an LP for this channel
        prob = LpProblem(f"Maximize_NTVR_{channel}", LpMaximize)
        x = {i: LpVariable(f"x_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer')
             for i in df_ch.index}

        # maximise NTVR for this channel
        prob += lpSum(df_ch.loc[i, 'NTVR'] * x[i] for i in df_ch.index)

        # channel budget constraint
        total_cost = lpSum(df_ch.loc[i, 'NCost'] * x[i] for i in df_ch.index)
        prob += total_cost >= bonus_budget - budget_bound
        prob += total_cost <= bonus_budget + budget_bound

        # commercial-wise budget bounds (±5 % of each commercial’s budget)
        for c in df_ch['Commercial'].unique():
            indices = df_ch[df_ch['Commercial'] == c].index
            target = comm_budgets.get(c, 0)
            if target <= 0:
                continue
            comm_cost = lpSum(df_ch.loc[i, 'NCost'] * x[i] for i in indices)
            prob += comm_cost >= 0.95 * target
            prob += comm_cost <= 1.05 * target

        # solve
        solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit)
        prob.solve(solver)
        if prob.status != 1:
            results.append({"channel": channel, "success": False, "solver_status": LpStatus[prob.status]})
            continue

        # collect results
        df_ch['Spots'] = df_ch.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
        df_ch['Total_Cost'] = df_ch['Spots'] * df_ch['NCost']
        df_ch['Total_NTVR'] = df_ch['Spots'] * df_ch['NTVR']
        df_ch = df_ch[df_ch['Spots'] > 0]

        total_cost_ch = df_ch['Total_Cost'].sum()
        total_ntvr_ch = df_ch['Total_NTVR'].sum()
        cprp_ch = total_cost_ch / total_ntvr_ch if total_ntvr_ch else None

        results.append({
            "channel": channel,
            "success": True,
            "solver_status": LpStatus[prob.status],
            "total_cost": round(total_cost_ch, 2),
            "total_ntvr": round(total_ntvr_ch, 2),
            "cprp": round(cprp_ch, 2) if cprp_ch else None,
            "details": json.loads(df_ch.to_json(orient='records'))
        })

    return jsonify({
        "success": True,
        "solver_status": "Optimal",
        "totals": {
            "bonus_total_cost": sum(r["total_cost"] for r in results if r["success"]),
            "bonus_total_rating": sum(r["total_ntvr"] for r in results if r["success"]),
        },
        "tables": {
            "by_channel": [
                {
                    "Channel": r["channel"],
                    "Slot": "B",
                    "Spots": sum(d["Spots"] for d in r["details"]),
                    "Total_Cost": r["total_cost"],
                    "Total_Rating": r["total_ntvr"],
                }
                for r in results if r["success"]
            ],
            "by_program": [
                {
                    **d,
                    "Channel": r["channel"],
                    "Slot": "B"
                }
                for r in results if r["success"]
                for d in r["details"]
            ]
        }
    })


#4
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)

#check for updating