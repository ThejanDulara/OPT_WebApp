from flask import Flask, jsonify, request
from flask_cors import CORS
import mysql.connector
import pandas as pd
from pulp import LpProblem, LpMaximize, LpVariable, lpSum, PULP_CBC_CMD

app = Flask(__name__)
CORS(app)  # Enable CORS for communication with React frontend

# === Database Connection ===
def get_db_connection():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",        # Replace with your password if any
        database="opt_db"   # We'll create this DB shortly
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
    df = pd.DataFrame(rows, columns=['channel', 'program', 'cost', 'tvr', 'slot'])
    df.columns = ['Channel', 'Program', 'Cost', 'TVR', 'Slot']  # rename for consistency

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

    for c in range(num_commercials):
        indices = df_full[df_full['Commercial'] == c].index
        commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
        share = 1 / num_commercials
        prob += commercial_cost >= (share - 0.05) * total_budget
        prob += commercial_cost <= (share + 0.05) * total_budget

    solver = PULP_CBC_CMD(msg=True)
    prob.solve(solver)

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
        "channel_summary": channel_summary.to_dict(orient='records'),
        "df_result": df_full.to_dict(orient='records')
    })

@app.route('/optimize-by-rating', methods=['POST'])
def optimize_by_rating():
    data = request.get_json()
    df_full = pd.DataFrame(data.get('df_full'))
    rating_shares = data.get('rating_shares')
    total_budget = data.get('budget')
    budget_bound = data.get('budget_bound')
    num_commercials = data.get('num_commercials')
    min_spots = data.get('min_spots')
    max_spots = data.get('max_spots')

    if df_full.empty or not rating_shares:
        return jsonify({"error": "Missing data"}), 400

    prob = LpProblem("Maximize_TVR_With_Rating_Share", LpMaximize)
    x = {i: LpVariable(f"x2_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    # Objective
    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    # Budget constraint
    total_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost >= total_budget - budget_bound
    prob += total_cost <= total_budget + budget_bound

    # Commercial budget constraints
    for c in range(num_commercials):
        indices = df_full[df_full['Commercial'] == c].index
        commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
        share = 1 / num_commercials
        prob += commercial_cost >= (share - 0.05) * total_budget
        prob += commercial_cost <= (share + 0.05) * total_budget

    # Channel rating share constraints
    total_rating_expr = lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)
    for ch, pct in rating_shares.items():
        ch_indices = df_full[df_full['Channel'] == ch].index
        ch_rating = lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in ch_indices)
        share = pct / 100
        prob += ch_rating >= (share - 0.03) * total_rating_expr
        prob += ch_rating <= (share + 0.03) * total_rating_expr

    solver = PULP_CBC_CMD(msg=True)
    prob.solve(solver)

    # Assign solution
    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

    # Round values
    df_full[['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']] = df_full[[
        'Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating'
    ]].round(2)

    # Filter out zero spots
    df_full = df_full[df_full['Spots'] > 0].copy()

    # COMMERCIAL-WISE SUMMARY
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

    # CHANNEL-WISE SUMMARY
    total_rating = df_full['Total_Rating'].sum()
    channel_summary = df_full.groupby('Channel')[['Total_Rating', 'Total_Cost']].sum().reset_index()
    channel_summary['% of Total Rating'] = (channel_summary['Total_Rating'] / total_rating * 100).round(2)

    return jsonify({
        "success": True,
        "total_cost": round(df_full['Total_Cost'].sum(), 2),
        "total_rating": round(total_rating, 2),
        "cprp": round(df_full['Total_Cost'].sum() / total_rating, 2) if total_rating else None,
        "channel_summary": channel_summary.to_dict(orient='records'),
        "commercials_summary": commercials_summary,
        "df_result": df_full.to_dict(orient='records')
    })

if __name__ == '__main__':
    app.run(debug=True)

