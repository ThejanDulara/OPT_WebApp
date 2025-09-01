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
    num_commercials = data.get('num_commercials')
    durations = data.get('durations')

    negotiated_rates = data.get('negotiated_rates', {})     # { programId: value }
    channel_discounts = data.get('channel_discounts', {})   # { channel: pct }

    if not program_ids or not num_commercials or not durations:
        return jsonify({"error": "Missing required data"}), 400

    # 1) Fetch selected programs from DB (include id so overrides work)
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    fmt = ','.join(['%s'] * len(program_ids))
    cursor.execute(f"SELECT id, channel, day, time, program, cost, tvr, slot FROM programs WHERE id IN ({fmt})", tuple(program_ids))
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
        "total_cost": round(total_cost_all, 2),
        "total_rating": round(df_full['Total_Rating'].sum(), 2),
        "cprp": round(total_cost_all / df_full['Total_Rating'].sum(), 2) if df_full['Total_Rating'].sum() else None,
        "commercials_summary": commercials_summary,
        #"channel_summary": channel_summary.to_dict(orient='records'),
        "channel_summary": json.loads(channel_summary.to_json(orient='records')),
        "df_result": json.loads(df_full.to_json(orient='records'))
        #"df_result": df_full.to_dict(orient='records')

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
            "INSERT INTO programs (channel, day, time, program, cost, tvr, slot) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (channel, p['day'], p['time'], p['program'], p['cost'], p['tvr'], p['slot'])
        )

    conn.commit()
    conn.close()
    return jsonify({'message': 'Programs updated'})


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
        prime_indices = df_full[(df_full['Channel'] == ch) & (df_full['Slot'] == 'A')].index
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
        ch_prime = df_ch[df_ch['Slot'] == 'A']
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

@app.route('/optimize-bonus', methods=['POST'])
def optimize_bonus():
    """
    Expected JSON payload (self-contained, no dependency on the main route):

    {
      "channels": ["DERANA","SIRASA"],
      "bonusBudgetsByChannel": {"DERANA": 1000000, "SIRASA": 600000},
      "channelAllowPctByChannel": {"DERANA": 0.10, "SIRASA": 0.10},     # optional; fallback to defaultChannelAllowPct
      "defaultChannelAllowPct": 0.10,                                    # optional; default 0.10
      "timeLimitSec": 120,
      "maxSpots": 20,
      "commercialTolerancePct": 0.05,                                    # ±5% around commercial targets
      "programRows": [                                                   # already filtered to Slot B & duplicated by commercial
        {
          "RowId": 1,            # optional; if absent we create a synthetic id
          "Channel": "DERANA",
          "Program": "Show X",
          "Slot": "B",
          "Commercial": "com_1", # required (e.g., com_1, com_2, ...)
          "Duration": 30,
          "Rate": 50000,         # DB rate (no negotiated)
          "TVR": 3.2,            # per spot
          "NCost": 50000,        # optional; falls back to Rate if missing
          "NTVR": 3.2            # optional; falls back to TVR if missing
        },
        ...
      ],
      "commercialTargetsByChannel": {                                    # target spend per commercial within each channel
        "DERANA": {"com_1": 500000, "com_2": 500000},
        "SIRASA": {"com_1": 360000, "com_2": 240000}
      }
    }
    """

    # ---------- Parse & validate ----------
    try:
        p = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify({"success": False, "message": f"Invalid JSON: {e}"}), 400

    required = ["channels", "bonusBudgetsByChannel", "programRows", "commercialTargetsByChannel"]
    missing = [k for k in required if k not in p]
    if missing:
        return jsonify({"success": False, "message": f"Missing fields: {', '.join(missing)}"}), 400

    channels = list(p.get("channels") or [])
    bonus_budgets = dict(p.get("bonusBudgetsByChannel") or {})
    prog_rows_in = list(p.get("programRows") or [])
    com_targets_in = dict(p.get("commercialTargetsByChannel") or {})

    if not channels:
        return jsonify({"success": False, "message": "No channels provided."}), 400
    if not prog_rows_in:
        return jsonify({"success": False, "message": "No programRows provided."}), 400

    # Defaults / options
    time_limit = int(p.get("timeLimitSec", 120))
    max_spots = int(p.get("maxSpots", 20))
    com_tol = float(p.get("commercialTolerancePct", 0.05))
    allow_pct_by_channel = dict(p.get("channelAllowPctByChannel") or {})
    default_allow = float(p.get("defaultChannelAllowPct", 0.10))

    # Fallback to Rate/TVR if NCost/NTVR missing; keep only Slot B to be safe
    prog_rows = []
    auto_id = 1
    for row in prog_rows_in:
        if str(row.get("Slot", "")).upper() != "B":
            continue  # enforce Slot B
        ch = row.get("Channel")
        if not ch:
            continue
        com = row.get("Commercial")
        if not com:
            continue  # we need commercial-wise decision variables

        ncost = row.get("NCost", None)
        ntvr = row.get("NTVR", None)
        rate = row.get("Rate", 0.0)
        tvr = row.get("TVR", 0.0)

        # normalize numeric
        try:
            ncost = float(ncost) if ncost is not None else float(rate or 0.0)
        except:
            ncost = float(rate or 0.0)
        try:
            ntvr = float(ntvr) if ntvr is not None else float(tvr or 0.0)
        except:
            ntvr = float(tvr or 0.0)

        row_id = row.get("RowId", None)
        if row_id is None:
            row_id = auto_id
            auto_id += 1

        prog_rows.append({
            "RowId": row_id,
            "Channel": ch,
            "Program": row.get("Program", ""),
            "Commercial": com,
            "Duration": row.get("Duration", None),
            "NCost": ncost,
            "NTVR": ntvr
        })

    if not prog_rows:
        return jsonify({"success": False, "message": "No valid Slot B program rows after filtering/validation."}), 400

    # ---------- Build indices ----------
    # Map channel -> rows, (channel,commercial) -> rows
    rows_by_channel = defaultdict(list)
    rows_by_ch_com = defaultdict(list)
    all_row_ids = []

    for r in prog_rows:
        rid = r["RowId"]
        ch = r["Channel"]
        cm = r["Commercial"]
        rows_by_channel[ch].append(r)
        rows_by_ch_com[(ch, cm)].append(r)
        all_row_ids.append(rid)

    # Channel bounds: ± allow % around bonus budgets
    ch_bounds = {}
    for ch in channels:
        bb = float(bonus_budgets.get(ch, 0.0))
        allow = float(allow_pct_by_channel.get(ch, default_allow))
        lower = bb * (1.0 - allow)
        upper = bb * (1.0 + allow)
        ch_bounds[ch] = (lower, upper)

    # Commercial targets per channel: each has ± com_tol
    com_bounds = {}
    for ch in channels:
        com_map = dict(com_targets_in.get(ch, {}))
        for cm, tgt in com_map.items():
            tgt = float(tgt or 0.0)
            lower = tgt * (1.0 - com_tol)
            upper = tgt * (1.0 + com_tol)
            com_bounds[(ch, cm)] = (lower, upper)

    # ---------- Optimization model ----------
 #   if pulp is None:
#        return jsonify({"success": False, "message": "PuLP not available in this environment."}), 500

    prob = LpProblem("Bonus_Optimization", LpMaximize)

    # Decision variables: integer spots per row
    # x[rid] ∈ {0,...,max_spots}
    x = {r["RowId"]: LpVariable(f"x_{r['RowId']}", lowBound=0, upBound=max_spots, cat=LpInteger)
         for r in prog_rows}

    # Objective: maximize sum NT﻿VR * x
    prob += lpSum((r["NTVR"] * x[r["RowId"]]) for r in prog_rows)

    # Channel spend bounds
    for ch in channels:
        ch_rows = rows_by_channel.get(ch, [])
        if not ch_rows:
            # If no rows for this channel, constrain it to 0 within bounds if bounds include 0; else it's infeasible.
            lower, upper = ch_bounds.get(ch, (0.0, 0.0))
            prob += lpSum([]) >= lower  # 0 >= lower
            prob += lpSum([]) <= upper  # 0 <= upper
            continue
        lower, upper = ch_bounds.get(ch, (0.0, 0.0))
        prob += lpSum((r["NCost"] * x[r["RowId"]]) for r in ch_rows) >= lower
        prob += lpSum((r["NCost"] * x[r["RowId"]]) for r in ch_rows) <= upper

    # Commercial (per channel) spend bounds
    # Only add constraints if there are rows for that (ch,com) pair; else skip.
    for (ch, cm), (lower, upper) in com_bounds.items():
        chcm_rows = rows_by_ch_com.get((ch, cm), [])
        if chcm_rows:
            prob += lpSum((r["NCost"] * x[r["RowId"]]) for r in chcm_rows) >= lower
            prob += lpSum((r["NCost"] * x[r["RowId"]]) for r in chcm_rows) <= upper

    # Solve with CBC timelimit
    solver = PULP_CBC_CMD(timeLimit=time_limit, msg=False)
    prob.solve(solver)

    status_str = LpStatus.get(prob.status, str(prob.status))

    # Quick feasibility checks to align with your main route style
    has_solution = any(var.value() and var.value() > 0 for var in x.values())
    if status_str in ("Infeasible", "Unbounded", "Undefined"):
        return jsonify({
            "success": False,
            "message": f"⚠️ No feasible solution. Solver status: {status_str}",
            "solver_status": status_str
        }), 200
    if not has_solution:
        return jsonify({
            "success": False,
            "message": "⚠️ No feasible solution found (no incumbent).",
            "solver_status": status_str
        }), 200

    # ---------- Build results ----------
    by_program_rows = []
    ch_cost = defaultdict(float)
    ch_rating = defaultdict(float)
    ch_spots = defaultdict(int)

    # Map rowid -> row for convenience
    row_by_id = {r["RowId"]: r for r in prog_rows}

    for rid, var in x.items():
        v = int(round(var.value() or 0))
        if v <= 0:
            continue
        rr = row_by_id[rid]
        ch = rr["Channel"]
        program = rr["Program"]
        com = rr["Commercial"]
        dur = rr.get("Duration")
        ncost = float(rr["NCost"])
        ntvr = float(rr["NTVR"])

        row_cost = ncost * v
        row_rating = ntvr * v

        ch_cost[ch] += row_cost
        ch_rating[ch] += row_rating
        ch_spots[ch] += v

        by_program_rows.append({
            "Channel": ch,
            "Program": program,
            "Commercial": com,
            "Duration": dur,
            "Spots": v,
            "Cost": ncost,        # per-spot cost (kept consistent with your main table schema)
            "TVR": ntvr,          # per-spot rating
            "NCost": ncost,
            "NTVR": ntvr,
            "Total_Cost": row_cost,
            "Total_Rating": row_rating,
            "Slot": "B"
        })

    # Channel summary table (Slot B only)
    by_channel_rows = []
    for ch in channels:
        by_channel_rows.append({
            "Channel": ch,
            "Slot": "B",
            "Spots": ch_spots.get(ch, 0),
            "Total_Cost": ch_cost.get(ch, 0.0),
            "Total_Rating": ch_rating.get(ch, 0.0)
        })

    totals = {
        "bonus_total_cost": sum(ch_cost.values()),
        "bonus_total_rating": sum(ch_rating.values())
    }

    result = {
        "success": True,
        "solver_status": status_str,
        "tables": {
            "by_program": by_program_rows,
            "by_channel": by_channel_rows
        },
        "totals": totals
    }

    # Mark non-optimal but feasible (mirror your UX messaging)
    if status_str not in ("Optimal",):
        result["note"] = "Feasible plan found within the time limit (not proven optimal)."

    return jsonify(result), 200
# ----- End paste block -----

#4
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)