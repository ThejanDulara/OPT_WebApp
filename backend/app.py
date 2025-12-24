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
from datetime import datetime
import numpy as np
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

    program_ids       = data.get('program_ids', [])
    tg                = data.get("target_group", "tvr_all")
    num_commercials   = data.get('num_commercials')
    durations         = data.get('durations')

    negotiated_rates  = data.get('negotiated_rates', {})   # { programId: value }
    channel_discounts = data.get('channel_discounts', {})  # { channel: pct }
    selected_client   = data.get('selected_client', "Other")  # NEW

    # ----- Allowed TG Values -----
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

    # ----- Special Logic Constants -----
    CARGILLS_CLIENT  = "Cargills"
    CARGILLS_CHANNEL = "DERANA TV"
    SPECIAL_CHANNELS = {
        "SHAKTHI TV",
        "SHAKTHI NEWS",
        "SIRASA TV",
        "SIRASA NEWS",
    }

    # ---------- 1. FETCH PROGRAMS WITH CARGILLS RATE ----------
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    fmt = ','.join(['%s'] * len(program_ids))
    cursor.execute(
        f"""
        SELECT
            id,
            channel,
            day,
            time,
            program,
            cost,
            net_cost,
            cargills_rate,
            {tg} AS tvr,
            slot
        FROM programs
        WHERE id IN ({fmt})
        """,
        tuple(program_ids)
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return jsonify({"error": "No programs found for given IDs"}), 400

    # ---------- 2. Build DataFrame ----------
    df = pd.DataFrame(rows)

    df.rename(columns={
        'id':           'Id',
        'channel':      'Channel',
        'day':          'Day',
        'time':         'Time',
        'program':      'Program',
        'cost':         'Cost',
        'tvr':          'TVR',
        'slot':         'Slot',
        'net_cost':     'NetCost',
        'cargills_rate':'CargillsRate',
    }, inplace=True)

    # Ensure numeric
    df['Cost']         = pd.to_numeric(df['Cost'], errors='coerce').fillna(0.0)
    df['TVR']          = pd.to_numeric(df['TVR'], errors='coerce').fillna(0.0)
    df['NetCost']      = pd.to_numeric(df['NetCost'], errors='coerce')
    df['CargillsRate'] = pd.to_numeric(df['CargillsRate'], errors='coerce')

    # ---------- 3. Effective Rate Calculation ----------
    def effective_cost(row):
        pid = row['Id']
        ch  = row['Channel']
        base_cost = float(row['Cost'])

        # 1) Explicit override from front-end ALWAYS takes priority
        if pid in negotiated_rates and negotiated_rates[pid] is not None:
            return float(negotiated_rates[pid])

        # 2) NEW: Cargills special rate for DERANA TV
        if (
            selected_client == CARGILLS_CLIENT
            and ch == CARGILLS_CHANNEL
            and pd.notna(row['CargillsRate'])
        ):
            return float(row['CargillsRate'])

        # 3) Old special channels → use net_cost
        if ch in SPECIAL_CHANNELS:
            if pd.notna(row['NetCost']):
                return float(row['NetCost'])
            return base_cost  # fallback if net_cost is null

        # 4) Normal channel → apply discount
        disc_pct = float(channel_discounts.get(ch, 30.0))
        return round(base_cost * (1.0 - disc_pct / 100.0), 2)

    df['Negotiated_Rate'] = df.apply(effective_cost, axis=1)

    # ---------- 4. Expand by commercials ----------
    df_list = []
    for c in range(int(num_commercials)):
        temp = df.copy()
        temp['Commercial'] = c
        duration = float(durations[c])

        temp['NTVR']  = (temp['TVR'] / 30.0) * duration
        temp['NCost'] = (temp['Negotiated_Rate'] / 30.0) * duration

        df_list.append(temp)

    df_full = pd.concat(df_list, ignore_index=True)

    # ---------- 5. Cleanup ----------
    cols_to_round = ['Cost', 'TVR', 'Negotiated_Rate', 'NTVR', 'NCost']
    for col in cols_to_round:
        df_full[col] = (
            pd.to_numeric(df_full[col], errors='coerce')
            .fillna(0.0)
            .round(2)
        )

    return jsonify({"df_full": json.loads(df_full.to_json(orient='records'))})




@app.route('/generate-bonus-df', methods=['POST'])
def generate_bonus_df():
    """
    Generate bonus (Slot B) optimization-ready DataFrame.
    Bonus programs:
    - Use raw 'cost' from DB (NO discounts or negotiations applied)
    - Use dynamic Target Group for TVR
    - Only duration-based normalization (NTVR / NCost)
    """
    data = request.get_json()

    program_ids = data.get('program_ids', [])
    tg = data.get("target_group", "tvr_all")  # Dynamic TG from frontend
    durations = data.get('durations', [])

    if not program_ids or not durations:
        return jsonify({"error": "Missing program_ids or durations"}), 400

    # Validate and fallback TG
    ALLOWED_TGS = [
        "tvr_all", "tvr_abc_15_90", "tvr_abc_30_60", "tvr_abc_15_30",
        "tvr_abc_20_plus", "tvr_ab_15_plus", "tvr_cd_15_plus",
        "tvr_ab_female_15_45", "tvr_abc_15_60", "tvr_bcde_15_plus",
        "tvr_abcde_15_plus", "tvr_abc_female_15_60", "tvr_abc_male_15_60",
    ]
    if tg not in ALLOWED_TGS:
        tg = "tvr_all"

    num_commercials = len(durations)

    # Fetch only raw cost + dynamic TG column
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    fmt = ','.join(['%s'] * len(program_ids))
    query = f"""
        SELECT 
            id,
            channel,
            day,
            time,
            program,
            cost,
            {tg} AS tvr,
            slot
        FROM programs 
        WHERE id IN ({fmt})
    """
    cursor.execute(query, tuple(program_ids))
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

    # Ensure numeric types
    df['Cost'] = pd.to_numeric(df['Cost'], errors='coerce').fillna(0.0)
    df['TVR']  = pd.to_numeric(df['TVR'], errors='coerce').fillna(0.0)

    # For bonus: Rate = Raw Cost (no negotiation, no discount)
    df['Negotiated_Rate'] = df['Cost']  # Exact copy — no changes

    # Expand by commercials with duration scaling
    df_list = []
    for c in range(num_commercials):
        temp = df.copy()
        temp['Commercial'] = f"com_{c + 1}"
        dur = float(durations[c])
        temp['Duration'] = dur

        # Scale TVR and Cost by duration (from 30-sec base)
        temp['NTVR']  = (temp['TVR'] / 30.0) * dur
        temp['NCost'] = (temp['Cost'] / 30.0) * dur   # Uses raw Cost → no discount
        temp['Slot'] = 'B'

        df_list.append(temp)

    df_full = pd.concat(df_list, ignore_index=True)

    # Remove duplicates (safety)
    df_full = df_full.drop_duplicates(subset=['Channel', 'Program', 'Day', 'Time', 'Commercial'])

    # Round numeric columns
    cols_to_round = ['Cost', 'TVR', 'Negotiated_Rate', 'NTVR', 'NCost']
    for col in cols_to_round:
        df_full[col] = pd.to_numeric(df_full[col], errors='coerce').fillna(0.0).round(2)

    return jsonify({
        "success": True,
        "df_full": json.loads(df_full.to_json(orient='records'))
    })


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

    # Convert ALL NumPy types to native Python types
    total_cost_all_native = float(total_cost_all)
    total_rating_native = float(df_full['Total_Rating'].sum())

    # Convert commercials_summary
    for commercial in commercials_summary:
        commercial["total_cost"] = float(commercial["total_cost"])
        commercial["total_rating"] = float(commercial["total_rating"])
        if commercial["cprp"] is not None:
            commercial["cprp"] = float(commercial["cprp"])

    # Convert channel_summary (it seems safe based on debug, but let's be sure)
    channel_summary_safe = json.loads(channel_summary.to_json(orient='records'))

    return jsonify({
        "success": True,
        "total_cost": round(total_cost_all_native, 2),
        "total_rating": round(total_rating_native, 2),
        "cprp": round(total_cost_all_native / total_rating_native, 2) if total_rating_native else None,
        "commercials_summary": commercials_summary,
        "channel_summary": channel_summary_safe,
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

    SPECIAL_CHANNELS = [
        "SHAKTHI TV",
        "SHAKTHI NEWS",
        "SIRASA TV",
        "SIRASA NEWS",
    ]

    conn = get_db_connection()
    cursor = conn.cursor()

    # Delete old programs for this channel
    cursor.execute("DELETE FROM programs WHERE channel = %s", (channel,))

    for p in programs:
        # net_cost only applies for the 4 special channels
        if channel in SPECIAL_CHANNELS:
            net_cost = p.get('net_cost')
        else:
            net_cost = None

        # cargills_rate only applies for DERANA TV
        if channel == "DERANA TV":
            cargills_rate = p.get('cargills_rate')
        else:
            cargills_rate = None

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
                tvr_abc_male_15_60,
                net_cost,
                cargills_rate
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s
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

                net_cost,
                cargills_rate
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

    # Optional: per-channel PT/NPT maps
    prime_map = data.get('channel_prime_pct_map') or {}
    nonprime_map = data.get('channel_nonprime_pct_map') or {}

    # Optional: global commercial shares (used as defaults)
    budget_proportions = data.get("budget_proportions", []) or []

    # NEW: per-channel commercial share overrides
    # Expected shape: { "Channel 1": [pct_com1, pct_com2, ...], ... }
    channel_commercial_pct_map = data.get('channel_commercial_pct_map') or {}

    if df_full.empty or not budget_shares:
        return jsonify({"error": "Missing data"}), 400

    # Safety: ensure required columns exist
    required_cols = {'NCost', 'NTVR', 'Channel', 'Slot'}
    missing = required_cols - set(df_full.columns)
    if missing:
        return jsonify({"error": f"Missing columns in df_full: {sorted(missing)}"}), 400

    # If any commercial split is supplied (global or per-channel), we need the Commercial column
    commercial_required = (num_commercials > 1) and (budget_proportions or channel_commercial_pct_map)
    if commercial_required and ('Commercial' not in df_full.columns):
        return jsonify({"error": "Commercial splits provided, but 'Commercial' column missing"}), 400

    prob = LpProblem("Maximize_TVR_With_Channel_and_Slot_Budget_Shares", LpMaximize)
    x = {i: LpVariable(f"x2_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

    # Objective: maximize NTVR * spots
    prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

    # Total budget constraint
    total_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
    prob += total_cost_expr >= total_budget - budget_bound
    prob += total_cost_expr <= total_budget + budget_bound

    # ------------------------------------------------------------
    # Commercial share constraints
    #   - If channel_commercial_pct_map is provided: enforce per-channel per-commercial shares.
    #     * No +/- tolerance
    #     * If pct == 0 -> forbid spots for that commercial on that channel.
    #   - Else (fallback): keep the existing global overall-plan commercial constraints (±5%).
    # ------------------------------------------------------------

    has_channel_commercial_overrides = isinstance(channel_commercial_pct_map, dict) and len(channel_commercial_pct_map) > 0

    if (num_commercials > 1) and (not has_channel_commercial_overrides) and budget_proportions:
        # Existing behavior: overall-plan constraints (±5% tolerance)
        for c in range(min(len(budget_proportions), num_commercials)):
            indices = df_full[df_full['Commercial'] == c].index
            if len(indices) == 0:
                continue
            commercial_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
            share = float(budget_proportions[c]) / 100.0
            prob += commercial_cost >= (share - 0.05) * total_budget
            prob += commercial_cost <= (share + 0.05) * total_budget

    # Channel-specific budget + PT/NPT + (NEW) per-channel commercial splits
    for ch, pct in budget_shares.items():
        ch_indices = df_full[df_full['Channel'] == ch].index
        if len(ch_indices) == 0:
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

        # Prefer per-channel splits; fallback to global
        ch_prime_pct = float(prime_map.get(ch, prime_pct_global))
        ch_nonprime_pct = float(nonprime_map.get(ch, nonprime_pct_global))

        # If Prime % = 0 → forbid PT spots
        if ch_prime_pct == 0:
            for i in prime_indices:
                prob += x[i] == 0
        else:
            prob += prime_cost >= ((ch_prime_pct / 100.0) - 0.05) * ch_budget
            prob += prime_cost <= ((ch_prime_pct / 100.0) + 0.05) * ch_budget

        # If Non-Prime % = 0 → forbid NPT spots
        if ch_nonprime_pct == 0:
            for i in nonprime_indices:
                prob += x[i] == 0
        else:
            prob += nonprime_cost >= ((ch_nonprime_pct / 100.0) - 0.05) * ch_budget
            prob += nonprime_cost <= ((ch_nonprime_pct / 100.0) + 0.05) * ch_budget

        # NEW: per-channel commercial budgets (no +/- tolerance)
        if has_channel_commercial_overrides and (num_commercials > 1):
            # Pull channel-level array; fallback to global budget_proportions if not present
            ch_arr = channel_commercial_pct_map.get(ch)
            if ch_arr is None:
                ch_arr = budget_proportions

            # ensure list-like
            if not isinstance(ch_arr, (list, tuple)):
                ch_arr = []

            for c in range(num_commercials):
                pct_c = None
                if c < len(ch_arr):
                    try:
                        pct_c = float(ch_arr[c])
                    except Exception:
                        pct_c = None

                if pct_c is None:
                    # final fallback: equal split
                    pct_c = 100.0 / float(num_commercials)

                c_indices = df_full[(df_full['Channel'] == ch) & (df_full['Commercial'] == c)].index
                if len(c_indices) == 0:
                    continue

                c_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in c_indices)
                target = (pct_c / 100.0) * ch_budget

                # ---- RULE ----
                # pct == 0  → force zero spots
                # pct > 0   → allow ±5% tolerance
                if pct_c == 0:
                    for i in c_indices:
                        prob += x[i] == 0
                else:
                    prob += c_cost >= 0.95 * target
                    prob += c_cost <= 1.05 * target

    solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit, keepFiles=True)

    start_ts = time.time()
    prob.solve(solver)
    elapsed = time.time() - start_ts

    hit_time_limit_log = False
    try:
        log_file = f"{prob.name}.log"
        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                log_txt = f.read().lower()
            if "stopped on time limit" in log_txt or "time limit reached" in log_txt:
                hit_time_limit_log = True
    except Exception:
        pass

    hit_time_limit_elapsed = elapsed >= max(time_limit - 1.0, 0.95 * time_limit)
    hit_time_limit = hit_time_limit_log or hit_time_limit_elapsed

    status_str = LpStatus[prob.status]
    has_solution = any((v.varValue is not None and v.varValue > 0) for v in x.values())

    is_optimal = (status_str == 'Optimal') and (not hit_time_limit)
    feasible_but_not_optimal = (status_str == 'Not Solved') or hit_time_limit

    if status_str in ('Infeasible', 'Unbounded', 'Undefined'):
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

    df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
    df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
    df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

    cols_to_round = ['Cost', 'TVR', 'NTVR', 'NCost', 'Total_Cost', 'Total_Rating']
    for c in (set(cols_to_round) & set(df_full.columns)):
        df_full[c] = df_full[c].astype(float).round(2)
    df_full = df_full[df_full['Spots'] > 0].copy()

    commercials_summary = []
    if 'Commercial' in df_full.columns:
        for c in range(num_commercials):
            df_c = df_full[df_full['Commercial'] == c].copy()
            if df_c.empty:
                continue
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

    return jsonify({
        "success": True,
        "total_cost": float(round(total_cost_all, 2)),
        "total_rating": float(round(total_rating, 2)),
        "cprp": float(round(total_cost_all / total_rating, 2)) if total_rating else None,
        "channel_summary": channel_summary,
        "commercials_summary": [
            {
                **{k: v for k, v in c.items() if k != "details"},
                "details": json.loads(pd.DataFrame(c["details"]).to_json(orient="records"))
                if isinstance(c.get("details"), list) else json.loads(c["details"].to_json(orient="records"))
            }
            for c in commercials_summary
        ],
        "df_result": json.loads(df_full.to_json(orient="records")),
        "is_optimal": bool(is_optimal),
        "feasible_but_not_optimal": bool(feasible_but_not_optimal),
        "solver_status": str(LpStatus[prob.status]),
        "hit_time_limit": bool(hit_time_limit)
    }), 200


@app.route('/optimize-by-benefit-share', methods=['POST'])
def optimize_by_benefit_share():
    """
    Optimizes schedule based on Benefit Share percentages with channel-specific commercial splits.
    """
    try:
        data = request.get_json()

        # --- 1. DATA PREPARATION & SANITIZATION ---
        df_full = pd.DataFrame(data.get('df_full'))
        budget_shares = data.get('budget_shares') or {}
        benefit_channels = list(budget_shares.keys())

        # Filter for selected channels (only those with commercial benefit)
        if 'Channel' in df_full.columns:
            df_full = df_full[df_full['Channel'].isin(benefit_channels)].copy()

        # Sanitize numeric columns
        for col in ['NCost', 'NTVR', 'Cost', 'TVR']:
            if col in df_full.columns:
                df_full[col] = pd.to_numeric(df_full[col], errors='coerce').fillna(0.0)

        # Parse Parameters
        total_budget = float(data.get('budget', 0))
        budget_bound = float(data.get('budget_bound', 0))
        num_commercials = int(data.get('num_commercials', 1))
        min_spots = int(data.get('min_spots', 0))
        max_spots = int(data.get('max_spots', 10))
        prime_pct_global = float(data.get('prime_pct', 80))
        nonprime_pct_global = float(data.get('nonprime_pct', 20))
        time_limit = int(data.get("time_limit", 120))
        channel_slot_pct_map = data.get('channel_slot_pct_map') or {}
        budget_proportions = data.get('budget_proportions') or []
        channel_commercial_pct_map = data.get('channel_commercial_pct_map') or {}

        # Validate budget_proportions
        if not budget_proportions and num_commercials > 1:
            # Default equal split if not provided
            budget_proportions = [100.0 / num_commercials] * num_commercials
        else:
            budget_proportions = [float(p) for p in budget_proportions]

        # Validate channel_commercial_pct_map
        for ch in benefit_channels:
            if ch not in channel_commercial_pct_map:
                # Use global budget_proportions as default
                channel_commercial_pct_map[ch] = budget_proportions.copy()
            else:
                # Ensure array has correct length
                arr = channel_commercial_pct_map[ch]
                if isinstance(arr, list):
                    if len(arr) != num_commercials:
                        # Pad with last value or equal split
                        if len(arr) > 0:
                            last_val = arr[-1]
                            arr = arr + [last_val] * (num_commercials - len(arr))
                        else:
                            arr = budget_proportions.copy()
                        channel_commercial_pct_map[ch] = arr

        # Basic Validation
        if df_full.empty or not budget_shares:
            return jsonify({"error": "Missing data or empty selection"}), 400

        required_cols = {'NCost', 'NTVR', 'Channel', 'Slot'}
        missing = required_cols - set(df_full.columns)
        if missing:
            return jsonify({"error": f"Missing columns in df_full: {sorted(missing)}"}), 400

        if num_commercials > 1 and 'Commercial' not in df_full.columns:
            return jsonify({"error": "Commercial column missing when num_commercials > 1"}), 400

        # --- 2. PULP OPTIMIZATION MODEL ---
        prob = LpProblem("Maximize_TVR_CommercialBenefit", LpMaximize)

        # Variables: Integer spots per row
        x = {i: LpVariable(f"x_ben_{i}", lowBound=min_spots, upBound=max_spots, cat='Integer') for i in df_full.index}

        # Objective: Maximize Total NTVR (Rating)
        prob += lpSum(df_full.loc[i, 'NTVR'] * x[i] for i in df_full.index)

        # Global Budget Constraint
        total_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in df_full.index)
        prob += total_cost_expr >= total_budget - budget_bound
        prob += total_cost_expr <= total_budget + budget_bound

        # --- 3. CHANNEL & SLOT CONSTRAINTS ---
        from collections import defaultdict

        for ch, pct in budget_shares.items():
            ch_indices = df_full[df_full['Channel'] == ch].index
            if len(ch_indices) == 0:
                continue

            target_ch_budget = (float(pct) / 100.0) * total_budget
            ch_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in ch_indices)

            # Channel Budget Constraint (+/- 5%)
            prob += ch_cost_expr >= 0.95 * target_ch_budget
            prob += ch_cost_expr <= 1.05 * target_ch_budget

            # --- SLOT CONSTRAINTS ---
            ch_slot_pcts = channel_slot_pct_map.get(ch, {'A': prime_pct_global, 'B': nonprime_pct_global})

            # Group indices by slot for this channel
            slot_indices = defaultdict(list)
            for i in ch_indices:
                slot = df_full.loc[i, 'Slot']
                slot_indices[slot].append(i)

            for slot, indices in slot_indices.items():
                if not indices:
                    continue

                slot_pct = float(ch_slot_pcts.get(slot, 0))

                # Special case: If user sets slot to 0%, force spots to 0
                if slot_pct == 0:
                    for i in indices:
                        prob += x[i] == 0
                    continue

                # Normal Slot Constraint (+/- 5% tolerance)
                slot_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
                lower_share = (slot_pct / 100.0) - 0.05
                upper_share = (slot_pct / 100.0) + 0.05

                # Clamp lower bound to 0
                lower_share = max(0, lower_share)

                prob += slot_cost_expr >= lower_share * target_ch_budget
                prob += slot_cost_expr <= upper_share * target_ch_budget

            # --- CHANNEL × COMMERCIAL CONSTRAINTS (NEW) ---
            if num_commercials > 1:
                # Get the commercial percentages for this channel
                ch_commercial_pcts = channel_commercial_pct_map.get(ch, budget_proportions)

                # Ensure we have the right number of commercial percentages
                if len(ch_commercial_pcts) < num_commercials:
                    # Pad with last value or equal split
                    last_val = ch_commercial_pcts[-1] if ch_commercial_pcts else (100.0 / num_commercials)
                    ch_commercial_pcts = ch_commercial_pcts + [last_val] * (num_commercials - len(ch_commercial_pcts))

                for comm_idx in range(num_commercials):
                    comm_pct = float(ch_commercial_pcts[comm_idx])

                    # Filter indices for this channel and commercial
                    comm_indices = df_full[(df_full['Channel'] == ch) & (df_full['Commercial'] == comm_idx)].index
                    if len(comm_indices) == 0:
                        continue

                    # If commercial percentage is 0, force all spots to 0
                    if comm_pct == 0:
                        for i in comm_indices:
                            prob += x[i] == 0
                        continue

                    # Commercial cost expression
                    comm_cost_expr = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in comm_indices)

                    # Target budget for this commercial in this channel
                    target_comm_budget = (comm_pct / 100.0) * target_ch_budget

                    # Apply tolerance only if percentage > 0
                    if comm_pct > 0:
                        lower_share = (comm_pct / 100.0) - 0.05
                        upper_share = (comm_pct / 100.0) + 0.05

                        # Clamp lower bound to 0
                        lower_share = max(0, lower_share)

                        prob += comm_cost_expr >= lower_share * target_ch_budget
                        prob += comm_cost_expr <= upper_share * target_ch_budget
                    else:
                        # If 0% but we got here (shouldn't happen due to above check), force 0
                        prob += comm_cost_expr == 0

        # --- 4. GLOBAL COMMERCIAL CONSTRAINTS (Optional backup) ---
        if budget_proportions and num_commercials > 1 and 'Commercial' in df_full.columns:
            # This ensures overall commercial distribution if channel-specific constraints fail
            for c in range(num_commercials):
                indices = df_full[df_full['Commercial'] == c].index
                if len(indices) == 0:
                    continue

                comm_cost = lpSum(df_full.loc[i, 'NCost'] * x[i] for i in indices)
                share = float(budget_proportions[c]) / 100.0 if c < len(budget_proportions) else (1.0 / num_commercials)

                # +/- 5% tolerance on commercial split
                prob += comm_cost >= (share - 0.05) * total_budget
                prob += comm_cost <= (share + 0.05) * total_budget

        # --- 5. SOLVE ---
        solver = PULP_CBC_CMD(msg=True, timeLimit=time_limit, keepFiles=False)
        prob.solve(solver)

        status_str = LpStatus[prob.status]
        has_solution = any((v.varValue is not None and v.varValue > 0) for v in x.values())

        if status_str in ('Infeasible', 'Unbounded', 'Undefined') or not has_solution:
            return jsonify({
                "success": False,
                "message": f"⚠️ No feasible solution found. Solver status: {status_str}",
                "solver_status": status_str
            }), 200

        # --- 6. RESULT PROCESSING ---
        df_full['Spots'] = df_full.index.map(lambda i: int(x[i].varValue) if x[i].varValue else 0)
        df_full['Total_Cost'] = df_full['Spots'] * df_full['NCost']
        df_full['Total_Rating'] = df_full['Spots'] * df_full['NTVR']

        # Filter only active spots
        df_result = df_full[df_full['Spots'] > 0].copy()

        # Rounding for cleanliness
        numeric_cols = ['Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'Total_Rating']
        for c in numeric_cols:
            if c in df_result.columns:
                df_result[c] = df_result[c].astype(float).round(2)

        # --- 7. COMMERCIALS SUMMARY (Enhanced) ---
        commercials_summary = []
        if 'Commercial' in df_result.columns:
            for c in range(num_commercials):
                df_c = df_result[df_result['Commercial'] == c].copy()
                if df_c.empty:
                    commercials_summary.append({
                        "commercial_index": c,
                        "total_cost": 0.0,
                        "total_rating": 0.0,
                        "cprp": 0.0,
                        "channel_breakdown": {}
                    })
                    continue

                # Overall commercial metrics
                total_cost_c = float(df_c['Total_Cost'].sum())
                total_rating_c = float(df_c['Total_Rating'].sum())
                cprp_c = (total_cost_c / total_rating_c) if total_rating_c > 0 else 0.0

                # Channel breakdown for this commercial
                channel_breakdown = {}
                for ch in df_c['Channel'].unique():
                    df_ch = df_c[df_c['Channel'] == ch]
                    channel_cost = float(df_ch['Total_Cost'].sum())
                    channel_rating = float(df_ch['Total_Rating'].sum())
                    channel_breakdown[ch] = {
                        "cost": round(channel_cost, 2),
                        "rating": round(channel_rating, 2),
                        "percentage": round((channel_cost / total_cost_c * 100), 2) if total_cost_c > 0 else 0.0
                    }

                # Safe JSON conversion
                details_safe = df_c.fillna(0).to_dict(orient='records')

                commercials_summary.append({
                    "commercial_index": c,
                    "total_cost": round(total_cost_c, 2),
                    "total_rating": round(total_rating_c, 2),
                    "cprp": round(cprp_c, 2),
                    "channel_breakdown": channel_breakdown,
                    "details": details_safe
                })

        # --- 8. CHANNEL SUMMARY (Enhanced with commercial breakdown) ---
        channel_summary = []
        total_cost_all = float(df_result['Total_Cost'].sum())
        total_rating_all = float(df_result['Total_Rating'].sum())

        for ch in df_result['Channel'].unique():
            df_ch = df_result[df_result['Channel'] == ch]

            # Helper to get float sum safely
            def get_sum(df_in, col):
                return float(df_in[col].sum())

            ch_cost = get_sum(df_ch, 'Total_Cost')
            ch_rating = get_sum(df_ch, 'Total_Rating')

            # Breakdown by Slot
            def slot_sum(slot_name):
                return get_sum(df_ch[df_ch['Slot'] == slot_name], 'Total_Cost')

            a1 = slot_sum('A1')
            a2 = slot_sum('A2')
            a3 = slot_sum('A3')
            a4 = slot_sum('A4')
            a5 = slot_sum('A5')
            b = slot_sum('B')

            # Logic for Prime/NonPrime costs based on Channel type
            if ch == 'HIRU TV':
                prime_cost = a1 + a2 + a3 + a4 + a5
                nonprime_cost = b
            else:
                prime_cost = get_sum(df_ch[df_ch['Slot'].isin(['A', 'A1', 'A2', 'A3', 'A4', 'A5', 'P'])], 'Total_Cost')
                nonprime_cost = get_sum(df_ch[df_ch['Slot'] == 'B'], 'Total_Rating')

            # Ratings Breakdown
            prime_rating = get_sum(df_ch[df_ch['Slot'] != 'B'], 'Total_Rating')
            nonprime_rating = get_sum(df_ch[df_ch['Slot'] == 'B'], 'Total_Rating')

            # Commercial breakdown for this channel
            commercial_breakdown = {}
            if 'Commercial' in df_ch.columns:
                for c in range(num_commercials):
                    df_comm = df_ch[df_ch['Commercial'] == c]
                    if not df_comm.empty:
                        comm_cost = get_sum(df_comm, 'Total_Cost')
                        comm_rating = get_sum(df_comm, 'Total_Rating')
                        commercial_breakdown[f"Commercial_{c + 1}"] = {
                            "cost": round(comm_cost, 2),
                            "rating": round(comm_rating, 2),
                            "percentage": round((comm_cost / ch_cost * 100), 2) if ch_cost > 0 else 0.0
                        }

            channel_summary.append({
                'Channel': ch,
                'Total_Cost': round(ch_cost, 2),
                '% Cost': round((ch_cost / total_cost_all * 100), 2) if total_cost_all > 0 else 0,
                'Total_Rating': round(ch_rating, 2),
                '% Rating': round((ch_rating / total_rating_all * 100), 2) if total_rating_all > 0 else 0,
                'Prime Cost': round(prime_cost, 2),
                'Non-Prime Cost': round(nonprime_cost, 2),
                'Prime Rating': round(prime_rating, 2),
                'Non-Prime Rating': round(nonprime_rating, 2),
                # Individual slots (useful for Hiru)
                'A1 Cost': round(a1, 2),
                'A2 Cost': round(a2, 2),
                'A3 Cost': round(a3, 2),
                'A4 Cost': round(a4, 2),
                'A5 Cost': round(a5, 2),
                'B Cost': round(b, 2),
                # Commercial breakdown
                'Commercial_Breakdown': commercial_breakdown
            })

        # --- 9. FINAL RESPONSE ---
        df_result_safe = json.loads(df_result.to_json(orient="records"))

        return jsonify({
            "success": True,
            "total_cost": float(round(total_cost_all, 2)),
            "total_rating": float(round(total_rating_all, 2)),
            "cprp": float(round(total_cost_all / total_rating_all, 2)) if total_rating_all > 0 else 0.0,
            "channel_summary": channel_summary,
            "commercials_summary": commercials_summary,
            "df_result": df_result_safe,
            "solver_status": str(status_str),
            "message": "Optimization successful with channel-specific commercial splits"
        }), 200

    except Exception as e:
        print(f"Error in optimize_by_benefit_share: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

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

        # Convert numpy types to native Python types
        total_cost_ch = float(df_ch['Total_Cost'].sum())  # Convert to native float
        total_ntvr_ch = float(df_ch['Total_NTVR'].sum())  # Convert to native float
        cprp_ch = float(total_cost_ch / total_ntvr_ch) if total_ntvr_ch else None

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

@app.route('/save-plan', methods=['POST'])
def save_plan():
    """
    Save a completed optimization session (final plan) for later reuse.
    Expected JSON:
    {
      "user_id": "...",
      "user_first_name": "...",
      "user_last_name": "...",
      "metadata": {
        "client_name": "...",
        "brand_name": "...",
        "activation_from": "YYYY-MM-DD",
        "activation_to": "YYYY-MM-DD",
        "campaign": "...",
        "tv_budget": 123456,
        ...
      },
      "session_data": { ... }  # full snapshot from frontend
    }
    """
    payload = request.get_json() or {}

    user_id = payload.get("user_id")
    user_first_name = payload.get("user_first_name")
    user_last_name = payload.get("user_last_name")
    metadata = payload.get("metadata") or {}
    session_data = payload.get("session_data") or {}

    if not user_id:
        return jsonify({"success": False, "error": "Missing user_id"}), 400

    client_name = metadata.get("client_name")
    brand_name = metadata.get("brand_name")
    activation_from = metadata.get("activation_from")  # 'YYYY-MM-DD'
    activation_to = metadata.get("activation_to")      # 'YYYY-MM-DD'
    campaign = metadata.get("campaign")
    tv_budget = metadata.get("tv_budget")

    # total_budget can be the "totalBudgetInclProperty" you pass from frontend
    total_budget = metadata.get("total_budget")

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
            """
            INSERT INTO saved_plans (
              user_id,
              user_first_name,
              user_last_name,
              client_name,
              brand_name,
              activation_from,
              activation_to,
              campaign,
              total_budget,
              data
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                user_id,
                user_first_name,
                user_last_name,
                client_name,
                brand_name,
                activation_from,
                activation_to,
                campaign,
                tv_budget if tv_budget not in (None, "") else total_budget,
                json.dumps({
                    "metadata": metadata,
                    "session_data": session_data,
                })
            )
        )
        plan_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({"success": True, "plan_id": plan_id}), 200
    except Exception as e:
        print("Error in /save-plan:", e)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/plans', methods=['GET'])
def list_plans():
    """
    List saved plans.
    Query params:
      user_id: current user id
      is_admin: '1' if admin, otherwise normal user
    """
    user_id = request.args.get("user_id")
    is_admin = request.args.get("is_admin") == "1"

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    if is_admin:
        # Admin → see ALL plans
        cursor.execute(
            """
            SELECT
              id,
              user_id,
              user_first_name,
              user_last_name,
              client_name,
              brand_name,
              activation_from,
              activation_to,
              campaign,
              total_budget,
              created_at
            FROM saved_plans
            ORDER BY created_at DESC
            """
        )
    else:
        # Normal user → only own plans
        cursor.execute(
            """
            SELECT
              id,
              user_id,
              user_first_name,
              user_last_name,
              client_name,
              brand_name,
              activation_from,
              activation_to,
              campaign,
              total_budget,
              created_at
            FROM saved_plans
            WHERE user_id = %s
            ORDER BY created_at DESC
            """,
            (user_id,)
        )

    rows = cursor.fetchall()
    conn.close()

    return jsonify({"success": True, "plans": rows}), 200


@app.route('/plans/<int:plan_id>', methods=['GET'])
def get_plan(plan_id):
    """
    Load a single saved plan (for reuse).
    Returns metadata + session_data.
    """
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT
          id,
          user_id,
          user_first_name,
          user_last_name,
          client_name,
          brand_name,
          activation_from,
          activation_to,
          campaign,
          total_budget,
          created_at,
          data
        FROM saved_plans
        WHERE id = %s
        """,
        (plan_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": False, "error": "Plan not found"}), 404

    try:
        data_blob = row.get("data")
        parsed = json.loads(data_blob) if isinstance(data_blob, str) else (data_blob or {})
    except Exception:
        parsed = {}

    return jsonify({
        "success": True,
        "id": row["id"],
        "user_id": row["user_id"],
        "user_first_name": row.get("user_first_name"),
        "user_last_name": row.get("user_last_name"),
        "client_name": row.get("client_name"),
        "brand_name": row.get("brand_name"),
        "activation_from": row.get("activation_from"),
        "activation_to": row.get("activation_to"),
        "campaign": row.get("campaign"),
        "total_budget": float(row.get("total_budget") or 0),
        "created_at": row.get("created_at"),
        "metadata": parsed.get("metadata") or {},
        "session_data": parsed.get("session_data") or {}
    }), 200

@app.route('/delete-plan/<int:plan_id>', methods=['DELETE'])
def delete_plan(plan_id):
    payload = request.get_json(silent=True) or {}
    user_id = payload.get("user_id")
    is_admin = payload.get("is_admin", False)

    if not user_id:
        return jsonify({"success": False, "error": "Missing user_id"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Get plan owner
        cursor.execute("SELECT user_id FROM saved_plans WHERE id = %s", (plan_id,))
        row = cursor.fetchone()

        if not row:
            conn.close()
            return jsonify({"success": False, "error": "Plan not found"}), 404

        owner_id = row["user_id"]

        # Permission check
        if not is_admin and str(owner_id) != str(user_id):
            conn.close()
            return jsonify({"success": False, "error": "Not authorized to delete this plan"}), 403

        # Delete
        cursor.execute("DELETE FROM saved_plans WHERE id = %s", (plan_id,))
        conn.commit()
        conn.close()

        return jsonify({"success": True}), 200

    except Exception as e:
        print("Error deleting plan:", e)
        return jsonify({"success": False, "error": str(e)}), 500


#4
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)

#check for updating