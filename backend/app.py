from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import pandas as pd
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, PULP_CBC_CMD
from pulp import LpStatus
import os
import json

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

    if not program_ids or not num_commercials or not durations:
        return jsonify({"error": "Missing required data"}), 400

    # 1. Fetch selected programs from DB
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    format_strings = ','.join(['%s'] * len(program_ids))
    cursor.execute(f"SELECT * FROM programs WHERE id IN ({format_strings})", tuple(program_ids))
    rows = cursor.fetchall()
    conn.close()

    # 2. Create df and df_full
    df = pd.DataFrame(rows, columns=['channel', 'day', 'time', 'program', 'cost', 'tvr', 'slot'])
    df.columns = ['Channel', 'Day', 'Time', 'Program', 'Cost', 'TVR', 'Slot']

    # Ensure numeric types
    df['Cost'] = pd.to_numeric(df['Cost'], errors='coerce').fillna(0)
    df['TVR'] = pd.to_numeric(df['TVR'], errors='coerce').fillna(0)

    df_list = []
    for c in range(num_commercials):
        temp_df = df.copy()
        temp_df['Commercial'] = c
        duration = durations[c]
        temp_df['NTVR'] = temp_df['TVR'] / 30 * duration
        temp_df['NCost'] = temp_df['Cost'] / 30 * duration
        df_list.append(temp_df)

    df_full = pd.concat(df_list, ignore_index=True)

    # 3. Return df_full as JSON
    df_json = df_full.to_dict(orient='records')
    return jsonify({"df_full": df_json})


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

        commercials_summary.append({
            "commercial_index": c,
            "total_cost": round(total_cost_c, 2),
            "total_rating": round(total_rating_c, 2),
            "cprp": round(cprp_c, 2) if cprp_c else None,
            "details": df_c.to_dict(orient='records')
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

    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit)
    prob.solve(solver)

    status_str = LpStatus[prob.status]  # 'Optimal', 'Not Solved', 'Infeasible', 'Unbounded', 'Undefined'
    has_solution = any((v.varValue is not None and v.varValue > 0) for v in x.values())
    is_optimal = (status_str == 'Optimal')

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

    feasible_but_not_optimal = (not is_optimal and status_str in ('Not Solved',))

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
    return jsonify({
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
    }), 200


#4
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)