from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import pandas as pd
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, PULP_CBC_CMD
from pulp import LpStatus
import logging
logging.basicConfig(level=logging.INFO, filename='opt_error.log', filemode='a',
                    format='%(asctime)s - %(levelname)s - %(message)s')



app = Flask(__name__)
CORS(app)  # Enable CORS for communication with React frontend

# === Database Connection ===
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="opt_user",         #"root",
        password="securepassword",        # Replace with your password if any
        database="optimization"   # We'll create this DB shortly
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
    try:
        data = request.get_json()
        df_full = pd.DataFrame(data.get('df_full'))
        total_budget = data.get('budget')
        budget_bound = data.get('budget_bound')
        min_spots = data.get('min_spots')
        max_spots = data.get('max_spots')
        num_commercials = data.get('num_commercials')

        if df_full.empty:
            logging.warning("Optimization aborted: df_full is empty.")
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

        time_limit = data.get("time_limit", 120)
        solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit)
        prob.solve(solver)

        if prob.status != 1:
            logging.error("Optimization failed: No feasible solution.")
            logging.error(f"Status: {LpStatus[prob.status]}")
            logging.error(f"Total budget: {total_budget}, Bound: ±{budget_bound}")
            return jsonify({
                "success": False,
                "message": "⚠️ Optimization failed — no feasible solution found. Please check constraints or budget."
            }), 200

        df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
        df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
        df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

        df_full[['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']] = df_full[[
            'Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating'
        ]].round(2)

        df_full = df_full[df_full['Spots'] > 0].copy()

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

        channel_summary = df_full.groupby('Channel')['Total_Cost'].sum().reset_index()
        total_cost_all = df_full['Total_Cost'].sum()
        channel_summary['% of Total'] = (channel_summary['Total_Cost'] / total_cost_all * 100).round(2)

        return jsonify({
            "success": True,
            "total_cost": round(total_cost_all, 2),
            "total_rating": round(df_full['Total_Rating'].sum(), 2),
            "cprp": round(total_cost_all / df_full['Total_Rating'].sum(), 2) if df_full['Total_Rating'].sum() else None,
            "commercials_summary": commercials_summary,
            "channel_summary": channel_summary.to_dict(orient='records'),
            "df_result": df_full.to_dict(orient='records')
        })

    except Exception as e:
        logging.exception("❌ Unexpected error during optimization:")
        return jsonify({
            "success": False,
            "message": "❌ Optimization failed due to a server error. Please check logs for details."
        }), 500


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
    budget_shares = data.get('budget_shares')
    total_budget = data.get('budget')
    budget_bound = data.get('budget_bound')
    num_commercials = data.get('num_commercials')
    min_spots = data.get('min_spots')
    max_spots = data.get('max_spots')
    prime_pct = float(data.get('prime_pct'))
    nonprime_pct = float(data.get('nonprime_pct'))
    time_limit = data.get("time_limit", 120)

    if df_full.empty or not budget_shares:
        return jsonify({"error": "Missing data"}), 400

    prob = LpProblem("Maximize_TVR_With_Channel_and_Slot_Budget_Shares", LpMaximize)
    x = {i: LpVariable(f"x2_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    # Objective
    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    # Total budget constraint
    total_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost >= total_budget - budget_bound
    prob += total_cost <= total_budget + budget_bound

    budget_proportions = data.get("budget_proportions", [])
    if budget_proportions:
        for c in range(num_commercials):
            indices = df_full[df_full['Commercial'] == c].index
            commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            share = budget_proportions[c] / 100
            prob += commercial_cost >= (share - 0.05) * total_budget
            prob += commercial_cost <= (share + 0.05) * total_budget

    # Channel-specific budget and slot constraints
    for ch, pct in budget_shares.items():
        ch_indices = df_full[df_full['Channel'] == ch].index
        ch_budget = (pct / 100) * total_budget
        ch_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in ch_indices)
        prob += ch_cost >= 0.95 * ch_budget
        prob += ch_cost <= 1.05 * ch_budget

        prime_indices = df_full[(df_full['Channel'] == ch) & (df_full['Slot'] == 'A')].index
        nonprime_indices = df_full[(df_full['Channel'] == ch) & (df_full['Slot'] == 'B')].index

        prime_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in prime_indices)
        nonprime_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in nonprime_indices)

        prob += prime_cost >= (prime_pct / 100 - 0.05) * ch_budget
        prob += prime_cost <= (prime_pct / 100 + 0.05) * ch_budget
        prob += nonprime_cost >= (nonprime_pct / 100 - 0.05) * ch_budget
        prob += nonprime_cost <= (nonprime_pct / 100 + 0.05) * ch_budget

    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit)
    prob.solve(solver)

    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']
    df_full[['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']] = df_full[[
        'Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating'
    ]].round(2)
    df_full = df_full[df_full['Spots'] > 0].copy()

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

    total_rating = df_full['Total_Rating'].sum()
    total_cost_all = df_full['Total_Cost'].sum()
    channel_summary = []

    for ch in df_full['Channel'].unique():
        df_ch = df_full[df_full['Channel'] == ch]
        ch_cost = df_ch['Total_Cost'].sum()
        ch_rating = df_ch['Total_Rating'].sum()
        ch_prime = df_ch[df_ch['Slot'] == 'A']
        ch_nonprime = df_ch[df_ch['Slot'] == 'B']
        prime_cost = ch_prime['Total_Cost'].sum()
        nonprime_cost = ch_nonprime['Total_Cost'].sum()
        prime_rating = ch_prime['Total_Rating'].sum()
        nonprime_rating = ch_nonprime['Total_Rating'].sum()

        channel_summary.append({
            'Channel': ch,
            'Total_Cost': round(ch_cost, 2),
            '% Cost': round(ch_cost / total_cost_all * 100, 2) if total_cost_all else 0,
            'Total_Rating': round(ch_rating, 2),
            '% Rating': round(ch_rating / total_rating * 100, 2) if total_rating else 0,
            'Prime Cost': round(prime_cost, 2),
            'Non-Prime Cost': round(nonprime_cost, 2),
            'Prime Rating': round(prime_rating, 2),
            'Non-Prime Rating': round(nonprime_rating, 2),
            'Prime Cost %': round(prime_cost / ch_cost * 100, 2) if ch_cost else 0,
            'Non-Prime Cost %': round(nonprime_cost / ch_cost * 100, 2) if ch_cost else 0
        })

    return jsonify({
        "success": True,
        "total_cost": round(total_cost_all, 2),
        "total_rating": round(total_rating, 2),
        "cprp": round(total_cost_all / total_rating, 2) if total_rating else None,
        "channel_summary": channel_summary,
        "commercials_summary": commercials_summary,
        "df_result": df_full.to_dict(orient='records')
    })


if __name__ == '__main__':
    app.run(debug=True)

