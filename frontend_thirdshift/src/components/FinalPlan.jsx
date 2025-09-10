// src/components/FinalPlan.jsx
import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function FinalPlan({
  // Accept BOTH naming styles so App.js doesn't have to change
  mainResults: _mainResults,
  bonusResults: _bonusResults,
  basePlanResult,     // from your current App.js
  bonusResult,        // from your current App.js
  totalBudgetInclProperty, // optional explicit budget (unchanged by bonus)
  propertyPrograms = {},
  styles = {},
  formatLKR = (v) =>
    `LKR ${Number(v ?? 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`,
  formatLKR_1 = (v) =>
    `${Number(v ?? 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`,
  onHome,
}) {
  // ---- Normalize inputs (support both prop name styles) ----
  const mainResults = _mainResults || basePlanResult || {};
  const bonusResults = _bonusResults || bonusResult || {};

  // ---------- Helpers ----------
  const num = (v, d = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const toStr = (v) => (v == null ? '' : String(v));
  const safeFx = (v, d = 2) => (Number.isFinite(+v) ? (+v).toFixed(d) : (0).toFixed(d));

     // put near your other helpers
    const normalizeCommercial = (raw, { zeroBasedNumeric = false } = {}) => {
      const s = toStr(raw).trim();
      if (!s) return 'COM_1';

      // COM_# or variants -> keep the number as-is
      const mCom = s.match(/^COM[_\s-]?(\d+)$/i);
      if (mCom) return `COM_${parseInt(mCom[1], 10)}`;

      // pure number -> choose 0-based vs 1-based semantics
      if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        return `COM_${zeroBasedNumeric ? n + 1 : n}`;
      }

      // any other text with a number inside -> take that number as-is
      const m = s.match(/(\d+)/);
      if (m) return `COM_${parseInt(m[1], 10)}`;

      // fallback (rare)
      return s.toUpperCase();
    };
    const moneyCell = (v) =>
      Number(v ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


  // ---------- Tables ----------
  // Main tables from optimization results
  const mainByProgram  = useMemo(() => {
    // Try multiple sources for main program data
    return mainResults?.tables?.by_program ||
           mainResults?.df_result ||
           [];
  }, [mainResults]);

  const mainByChannel  = useMemo(() => {
    return mainResults?.tables?.by_channel ||
           mainResults?.channel_summary ||
           [];
  }, [mainResults]);

  // Main commercials summary from optimization results
  const mainCommercialsSummary = useMemo(() => {
    return mainResults?.commercials_summary || [];
  }, [mainResults]);

  // Bonus tables
  const bonusByProgram = useMemo(() => bonusResults?.tables?.by_program || [], [bonusResults]);
  const bonusByChannel = useMemo(() => bonusResults?.tables?.by_channel || [], [bonusResults]);

  // ---------- Budget (unchanged) ----------
  // Prefer prop; else try main totals; else fallback to sum of main channel costs
  const budgetInclProperty = useMemo(() => {
    if (Number.isFinite(+totalBudgetInclProperty)) return +totalBudgetInclProperty;
    const t =
      mainResults?.inclusiveTotals?.totalBudgetIncl ??
      mainResults?.totals?.total_budget_incl_property ??
      mainResults?.totals?.total_cost_incl_property ??
      mainResults?.total_cost;
    if (Number.isFinite(+t)) return +t;
    const sum = (mainByChannel || []).reduce((a, r) => a + num(r.Total_Cost), 0);
    return sum;
  }, [totalBudgetInclProperty, mainResults, mainByChannel]);

  // ---------- NGRP (main, incl. property) ----------
  const mainNGRP = useMemo(() => {
    const t =
      mainResults?.inclusiveTotals?.totalNGRPIncl ??
      mainResults?.totals?.total_rating_incl_property ??
      mainResults?.totals?.total_rating ??
      mainResults?.total_rating;
    if (Number.isFinite(+t)) return +t;
    const ch = mainByChannel.reduce((a, r) => a + num(r.Total_Rating), 0);
    if (ch > 0) return ch;
    return mainByProgram.reduce((a, r) => a + num(r.Total_Rating), 0);
  }, [mainResults, mainByChannel, mainByProgram]);

  const mainCPRP = useMemo(
    () => (mainNGRP > 0 ? budgetInclProperty / mainNGRP : 0),
    [budgetInclProperty, mainNGRP]
  );

    // ---------- Property Program Details (flat, sorted by Channel) ----------
    const flatPropertyPrograms = useMemo(() => {
      const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
      const toInt = (v) => (isNaN(parseInt(v, 10)) ? 0 : parseInt(v, 10));

      const rows = [];
      Object.entries(propertyPrograms || {}).forEach(([ch, arr]) => {
        (arr || []).forEach((r) => {
          const name     = r.programName ?? r['Name of the program'] ?? '';
          const comName  = r.comName ?? r['Com name'] ?? r.ComName ?? r['Com Name'] ?? '';
          const day      = r.day ?? r.Day ?? '';
          const time     = r.time ?? r.Time ?? '';
          const budget   = toNum(r.budget ?? r.Budget);
          const duration = toNum(r.duration ?? r.Duration);
          const tvr      = toNum(r.tvr ?? r.TVR);
          const spots    = toInt(r.spots ?? r.Spots);

          // Derive if missing
          const ntvr  = (r.ntvr ?? r.NTVR) != null ? toNum(r.ntvr ?? r.NTVR) : (tvr / 30) * duration;
          const ncost = (r.ncost ?? r.NCost) != null ? toNum(r.ncost ?? r.NCost) : (spots > 0 ? budget / spots : 0);
          const ngrp  = (r.ngrp ?? r.NGRP) != null ? toNum(r.ngrp ?? r.NGRP) : (ntvr * spots);

          rows.push({
            Channel: String(ch),
            'Name of the program': name,
            'Com name': comName,
            Day: day,
            Time: time,
            Budget: budget,
            NCost: ncost,
            Duration: duration,
            TVR: tvr,
            NTVR: ntvr,
            Spots: spots,
            NGRP: ngrp,
          });
        });
      });

      rows.sort((a, b) => a.Channel.localeCompare(b.Channel));
      return rows;
    }, [propertyPrograms]);

    const propertyTotals = useMemo(() => {
      const budget = (flatPropertyPrograms || []).reduce((a, r) => a + num(r.Budget), 0);
      const ngrp   = (flatPropertyPrograms || []).reduce((a, r) => a + num(r.NGRP), 0);
      const cprp   = ngrp > 0 ? budget / ngrp : 0;
      return { budget, ngrp, cprp };
    }, [flatPropertyPrograms]);

  // ---------- Bonus totals ----------
  const bonusNGRP = useMemo(() => {
    const t = num(bonusResults?.totals?.bonus_total_rating);
    if (t > 0) return t;
    const ch = bonusByChannel.reduce((a, r) => a + num(r.Total_Rating), 0);
    if (ch > 0) return ch;
    return bonusByProgram.reduce((a, r) => a + num(r.Total_Rating), 0);
  }, [bonusResults, bonusByChannel, bonusByProgram]);

  // ---------- Combined ----------
  const combinedNGRP = useMemo(() => mainNGRP + bonusNGRP, [mainNGRP, bonusNGRP]);
  const combinedCPRP = useMemo(
    () => (combinedNGRP > 0 ? budgetInclProperty / combinedNGRP : 0),
    [budgetInclProperty, combinedNGRP]
  );

  // ---------- Combined Commercial Allocation (Main + Bonus) ----------
  // First, process main commercials from optimization results
  const mainCommercialData = useMemo(() => {
    const commercialMap = {};

    // If we have commercials_summary, use that
    if (mainCommercialsSummary && mainCommercialsSummary.length > 0) {
      mainCommercialsSummary.forEach((commercial, index) => {
        const baseIdx = Number.isFinite(+commercial?.commercial_index)
        ? +commercial.commercial_index
        : index; // server is 0-based; make it 1-based for display
        const commercialKey = `COM_${baseIdx + 1}`;
        commercialMap[commercialKey] = {
          commercial_index: commercial.commercial_index,
          total_cost: commercial.total_cost,
          total_rating: commercial.total_rating,
          cprp: commercial.cprp,
          details: commercial.details || [],
          programs: commercial.details || []
        };
      });
    } else {
      // Fallback: group mainByProgram by Commercial field
      const grouped = {};
      mainByProgram.forEach((r) => {
        const c = normalizeCommercial(r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',{ zeroBasedNumeric: true });
        if (!grouped[c]) {
          grouped[c] = {
            programs: [],
            total_cost: 0,
            total_rating: 0
          };
        }
        grouped[c].programs.push(r);
        grouped[c].total_cost += num(r.Total_Cost);
        grouped[c].total_rating += num(r.Total_Rating);
      });

      Object.entries(grouped).forEach(([key, data]) => {
        commercialMap[key] = {
          commercial_index: parseInt(key.split('_')[1]) - 1,
          total_cost: data.total_cost,
          total_rating: data.total_rating,
          cprp: data.total_rating > 0 ? data.total_cost / data.total_rating : 0,
          details: data.programs,
          programs: data.programs
        };
      });
    }

    return commercialMap;
  }, [mainCommercialsSummary, mainByProgram]);

  // Group bonus programs by commercial
  const bonusCommercialData = useMemo(() => {
    const commercialMap = {};
    bonusByProgram.forEach((r) => {
     const c = normalizeCommercial(r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',{ zeroBasedNumeric: false });
      if (!commercialMap[c]) {
        commercialMap[c] = {
          programs: [],
          total_rating: 0
        };
      }
      commercialMap[c].programs.push(r);
      commercialMap[c].total_rating += num(r.Total_Rating ?? r.Total_NTVR);
    });
    return commercialMap;
  }, [bonusByProgram]);

  // Get all commercial keys (main + bonus)
  const allCommercialKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(mainCommercialData),
      ...Object.keys(bonusCommercialData)
    ]);

    const filtered = Array.from(keys).filter(key =>
      key.startsWith('COM_') || key.toUpperCase().startsWith('COM_')
    );

    filtered.sort((a, b) => {
      const ai = num(a.split('_')[1], 1e9);
      const bi = num(b.split('_')[1], 1e9);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    return filtered;
  }, [mainCommercialData, bonusCommercialData]);

  // ---------- Channel summary incl. bonus ----------
  const bonusNGRPByChannel = useMemo(() => {
    const m = {};
    bonusByChannel.forEach((r) => {
      const ch = toStr(r.Channel);
      m[ch] = (m[ch] || 0) + num(r.Total_Rating);
    });
    return m;
  }, [bonusByChannel]);

  const channelSummaryInclBonus = useMemo(() => {
    const rows = (mainByChannel || []).map((r) => {
      const ch = toStr(r.Channel);
      const budget = num(r.Total_Cost); // unchanged
      const ngrpm  = num(r.Total_Rating);
      const ngrpb  = num(bonusNGRPByChannel[ch]);
      return {
        Channel: ch,
        Slot: toStr(r.Slot),
        Spots: num(r.Spots),
        Total_Cost: budget,
        NGRP_Main: ngrpm,
        NGRP_Bonus: ngrpb,
        NGRP_Incl_Bonus: ngrpm + ngrpb,
      };
    });
    return rows;
  }, [mainByChannel, bonusNGRPByChannel]);

  // ---------- Final summary table ----------
  const finalSummaryRows = useMemo(() => {
    // budget unchanged from main; NGRP = main + bonus by channel; CPRP = budget / ngrp_with_bonus
    const idxMainBudget = new Map((mainByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Cost)]));
    const idxMainNgrp   = new Map((mainByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Rating)]));
    const idxBonusNgrp  = new Map((bonusByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Rating)]));
    const allCh = new Set([
      ...Array.from(idxMainBudget.keys()),
      ...Array.from(idxMainNgrp.keys()),
      ...Array.from(idxBonusNgrp.keys()),
    ]);
    return Array.from(allCh).sort().map((ch) => {
      const budget = idxMainBudget.get(ch) ?? 0;
      const ngrpm  = idxMainNgrp.get(ch) ?? 0;
      const ngrpb  = idxBonusNgrp.get(ch) ?? 0;
      const ngrpt  = ngrpm + ngrpb;
      const cprp   = ngrpt > 0 ? budget / ngrpt : 0;
      return { Channel: ch, Total_Budget: budget, NGRP_With_Bonus: ngrpt, CPRP: cprp };
    });
  }, [mainByChannel, bonusByChannel]);

      // Spot-only NGRP from main optimization tables (excludes Property & Bonus)
    const mainSpotNGRP = useMemo(() => {
      const ch = (mainByChannel || []).reduce((a, r) => a + num(r.Total_Rating), 0);
      if (ch > 0) return ch;
      return (mainByProgram || []).reduce((a, r) => a + num(r.Total_Rating), 0);
    }, [mainByChannel, mainByProgram]);

    // Total NGRP including Property + Bonus
    const totalNGRP_InclPropertyBonus = useMemo(
      () => mainSpotNGRP + (propertyTotals?.ngrp || 0) + (bonusNGRP || 0),
      [mainSpotNGRP, propertyTotals, bonusNGRP]
    );

    // CPRP using (Budget incl. Property) / (NGRP incl. Property + Bonus)
    const cprp_InclPropertyBonus = useMemo(
      () => (totalNGRP_InclPropertyBonus > 0 ? budgetInclProperty / totalNGRP_InclPropertyBonus : 0),
      [budgetInclProperty, totalNGRP_InclPropertyBonus]
    );

        // ---------- Per-channel Property & Combined summary ----------
    const propertyByChannel = useMemo(() => {
      const budgetByCh = {};
      const ngrpByCh = {};
      (flatPropertyPrograms || []).forEach((r) => {
        const ch = toStr(r.Channel);
        budgetByCh[ch] = (budgetByCh[ch] || 0) + num(r.Budget);
        ngrpByCh[ch] = (ngrpByCh[ch] || 0) + num(r.NGRP);
      });
      return { budgetByCh, ngrpByCh };
    }, [flatPropertyPrograms]);

    const mainCostByCh = useMemo(() => {
      const m = new Map();
      (mainByChannel || []).forEach((r) => m.set(toStr(r.Channel), num(r.Total_Cost)));
      return m;
    }, [mainByChannel]);

    const mainNGRPByCh = useMemo(() => {
      const m = new Map();
      (mainByChannel || []).forEach((r) => m.set(toStr(r.Channel), num(r.Total_Rating)));
      return m;
    }, [mainByChannel]);

    const combinedChannelRows = useMemo(() => {
      const allCh = new Set([
        ...Array.from(mainCostByCh.keys()),
        ...Object.keys(propertyByChannel.budgetByCh || {}),
        ...Object.keys(bonusNGRPByChannel || {}),
      ]);

      return Array.from(allCh).sort().map((ch) => {
        const costSpot    = mainCostByCh.get(ch) ?? 0;                                // Cost (LKR) Excl. property
        const propVal     = propertyByChannel.budgetByCh?.[ch] ?? 0;                  // Property value (LKR)
        const totalCost   = costSpot + propVal;                                       // Total Cost (incl. property)

        const ngrpSpot    = mainNGRPByCh.get(ch) ?? 0;                                // NGRP (Spot Buying)
        const ngrpProp    = propertyByChannel.ngrpByCh?.[ch] ?? 0;                    // NGRP (Property)
        const ngrpBonus   = bonusNGRPByChannel?.[ch] ?? 0;                            // Bonus NGRP
        const ngrpTotal   = ngrpSpot + ngrpProp + ngrpBonus;                          // Total NGRP

        const cprp        = ngrpTotal > 0 ? totalCost / ngrpTotal : 0;                // CPRP (LKR)

        return {
          Channel: ch,
          Cost_LKR: costSpot,
          Property_LKR: propVal,
          TotalCost_LKR: totalCost,
          NGRP_Spot: ngrpSpot,
          NGRP_Property: ngrpProp,
          NGRP_Bonus: ngrpBonus,
          NGRP_Total: ngrpTotal,
          CPRP_LKR: cprp,
        };
      });
    }, [mainCostByCh, mainNGRPByCh, propertyByChannel, bonusNGRPByChannel]);


  // ---------- Export ----------
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // 1) KPI cards (6)
    const kpiRows = [
      { Metric: 'Total Budget (incl. Property)', Value: budgetInclProperty },
      { Metric: 'NGRP (incl. Property)', Value: mainNGRP },
      { Metric: 'CPRP (incl. Property)', Value: mainCPRP },
      { Metric: 'Bonus NGRP', Value: bonusNGRP },
      { Metric: 'NGRP (incl. Property + Bonus)', Value: combinedNGRP },
      { Metric: 'CPRP (incl. Property + Bonus)', Value: combinedCPRP },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), 'Final KPIs');

    // 2) Main/Bonus raw sheets
    if (mainByProgram?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainByProgram), 'Main By Program');
    if (mainByChannel?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainByChannel), 'Main By Channel');
    if (bonusByProgram?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bonusByProgram), 'Bonus Programs');
    if (bonusByChannel?.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bonusByChannel), 'Bonus By Channel');

    // 3) Channel Summary (Incl Bonus)
    if (channelSummaryInclBonus?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(channelSummaryInclBonus), 'Channel Summary (Incl Bonus)');
    }

    // 4) Final Summary (Budget unchanged)
    if (finalSummaryRows?.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finalSummaryRows), 'Final Summary');
    }

    if (flatPropertyPrograms?.length) {
      XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(flatPropertyPrograms),
       'Property Programs'
     );
    }

    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'Final_Plan_With_Bonus.xlsx');
  };

  // ---------- Styles (same as OptimizationResults.jsx) ----------
  const s = {
    container: {marginTop: '24px', padding: '60px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '16px' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '20px' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
    summaryCard: { backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryCard_1: { marginBottom: '20px' , backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' },
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    exportButton: { padding: '12px 24px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', marginTop: '24px', marginRight: '20px' },
    backHomeButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px', marginRight: '20px' },
    primaryButton: { padding: '12px 24px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },

    // Commercial header
    commercialHeader: { fontWeight: '800', marginTop: '20px', marginBottom: '16px', color: '#2d3748', fontSize: '18px' },
    commercialSub: { fontSize: '13px', color: '#4a5568', marginBottom: '12px' },

    // Bonus row background
    bonusRow: { background: '#deeffa' }, // light ash
  };
  s.tdNowrap = { ...s.td, whiteSpace: 'nowrap' };

  // Helper for formatting numbers in table
  const toFixedOrInt = (key, val) => {
    const numericCols = ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'];
    const isNumeric = numericCols.includes(key);
    const isCount = key === 'Spots';
    if (isCount) return parseInt(val);
    if (isNumeric) return Number(val).toFixed(2);
    return val;
  };

  // ---------- Render ----------
  return (
    <div style={s.container}>
       <h2 style={s.pageTitle || {fontSize: 22,fontWeight: 700, margin: '8px 0 16px', letterSpacing: 0.3,}}>Final Optimized Plan (Property + Spot Buying + Bonus)</h2>
    {/* KPI Cards */}
    <div style={s.summaryGrid}>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Total Budget (incl. Property)</div>
        <div style={s.summaryValue}>{formatLKR(budgetInclProperty)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>NGRP (Main Optimization Only)</div>
        <div style={s.summaryValue}>{safeFx(mainSpotNGRP)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Property NGRP</div>
        <div style={s.summaryValue}>{safeFx(propertyTotals.ngrp)}</div>
      </div>
    </div>

    <div style={s.summaryGrid}>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Bonus NGRP</div>
        <div style={s.summaryValue}>{safeFx(bonusNGRP)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Total NGRP (incl. Property + Bonus)</div>
        <div style={s.summaryValue}>{safeFx(totalNGRP_InclPropertyBonus)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>CPRP (incl. Property + Bonus)</div>
        <div style={s.summaryValue}>{formatLKR(cprp_InclPropertyBonus)}</div>
      </div>
    </div>

    {/* Property Program Details */}
    {flatPropertyPrograms.length > 0 && (
      <>
        <h3 style={s.sectionTitle}>Property Program Details</h3>
        <div style={s.summaryCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={s.th}>Channel</th>
                  <th style={s.th}>Name of the program</th>
                  <th style={s.th}>Com name</th>
                  <th style={s.th}>Day</th>
                  <th style={s.th}>Time</th>
                  <th style={s.th}>Budget</th>
                  <th style={s.th}>NCost</th>
                  <th style={s.th}>Duration</th>
                  <th style={s.th}>TVR</th>
                  <th style={s.th}>NTVR</th>
                  <th style={s.th}>Spots</th>
                  <th style={s.th}>NGRP</th>
                </tr>
              </thead>
              <tbody>
                {flatPropertyPrograms.map((r, i) => (
                  <tr key={`pp-${i}`}>
                    <td style={{ ...s.td, textAlign: 'left' }}>{r.Channel}</td>
                    <td style={{ ...s.td, textAlign: 'left' }}>{r['Name of the program']}</td>
                    <td style={{ ...s.td, textAlign: 'left' }}>{r['Com name']}</td>
                    <td style={s.td}>{r.Day}</td>
                    <td style={s.td}>{r.Time}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Budget)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.NCost)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.Duration).toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.TVR).toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.NTVR).toFixed(2)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{parseInt(r.Spots, 10)}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.NGRP).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}


      {/* Commercial-wise Allocation (Combined Main + Bonus) */}
      <h3 style={s.sectionTitle}>Commercial-wise Allocation (Main + Bonus)</h3>
      <div style={{...s.commercialSub, marginBottom: '20px'}}>
        Shows main optimization results followed by bonus programs (shaded in light blue) for each commercial.
      </div>

      {allCommercialKeys.map((commercialKey) => {
        const mainData = mainCommercialData[commercialKey] || {};
        const bonusData = bonusCommercialData[commercialKey] || {};

        const mainPrograms = mainData.programs || [];
        const bonusPrograms = bonusData.programs || [];

        const mainBudget = num(mainData.total_cost);
        const mainNgrp = num(mainData.total_rating);
        const bonusNgrp = num(bonusData.total_rating);
        const totalNgrp = mainNgrp + bonusNgrp;

        const mainCprp = mainNgrp > 0 ? mainBudget / mainNgrp : 0;
        const combinedCprp = totalNgrp > 0 ? mainBudget / totalNgrp : 0;

        // Skip if no programs in either main or bonus
        if (mainPrograms.length === 0 && bonusPrograms.length === 0) {
          return null;
        }

        return (
          <div key={commercialKey} style={s.summaryCard_1}>
            <div style={s.commercialHeader}>{commercialKey.toUpperCase()}</div>
            <div style={s.commercialSub}>
              <strong>Total Budget:</strong> {formatLKR(mainBudget)} &nbsp; | &nbsp;
              <strong>Main NGRP:</strong> {safeFx(mainNgrp)} &nbsp; | &nbsp;
              <strong>Bonus NGRP:</strong> {safeFx(bonusNgrp)} &nbsp; | &nbsp;
              <strong>Combined NGRP:</strong> {safeFx(totalNgrp)} &nbsp; | &nbsp;
              <strong>Main CPRP:</strong> {formatLKR(mainCprp)} &nbsp; | &nbsp;
              <strong>Combined CPRP:</strong> {formatLKR(combinedCprp)}
            </div>

            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Channel</th>
                  <th style={s.th}>Program</th>
                  <th style={s.th}>Day</th>
                  <th style={{ ...s.th, whiteSpace: 'nowrap' }}>Time</th>
                  <th style={s.th}>Slot</th>
                  <th style={s.th}>Cost</th>
                  <th style={s.th}>TVR</th>
                  <th style={s.th}>NCost</th>
                  <th style={s.th}>NTVR</th>
                  <th style={s.th}>Total Budget</th>
                  <th style={s.th}>NGRP</th>
                  <th style={s.th}>Spots</th>
                </tr>
              </thead>
                <tbody>
                  {(() => {
                    // group helpers
                    const groupByChannel = (rows) => {
                      const m = {};
                      rows.forEach((r) => {
                        const ch = toStr(r.Channel);
                        if (!m[ch]) m[ch] = [];
                        m[ch].push(r);
                      });
                      return m;
                    };

                    const mainByCh  = groupByChannel(mainPrograms);
                    const bonusByCh = groupByChannel(bonusPrograms);

                    // union of channels (sorted)
                    const allChannels = Array.from(
                      new Set([...Object.keys(mainByCh), ...Object.keys(bonusByCh)])
                    ).sort((a, b) => a.localeCompare(b));

                    // nothing to render case
                    if (allChannels.length === 0) {
                      return (
                        <tr>
                          <td colSpan={12} style={{ ...s.td, color: '#718096' }}>
                            No data available for this commercial.
                          </td>
                        </tr>
                      );
                    }

                    // render channel-wise: main rows first, then bonus rows
                    return allChannels.flatMap((ch, chIdx) => {
                      const mainRows  = mainByCh[ch]  || [];
                      const bonusRows = bonusByCh[ch] || [];

                      const mainRendered = mainRows.map((r, i) => (
                        <tr key={`main-${ch}-${i}`}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Program)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                          <td style={s.tdNowrap}>{toStr(r.Time ?? '')}</td>
                          <td style={s.td}>{toStr(r.Slot ?? 'A')}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                          <td style={s.td}>{num(r.Spots ?? 0)}</td>
                        </tr>
                      ));

                      const bonusRendered = bonusRows.map((r, i) => (
                        <tr key={`bonus-${ch}-${i}`} style={s.bonusRow}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Program)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                          <td style={s.tdNowrap}>{toStr(r.Time ?? '')}</td>
                          <td style={s.td}>B</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                          <td style={s.td}>{num(r.Spots ?? 0)}</td>
                        </tr>
                      ));

                      // optional: add a thin separator between channels (visual only)
                      const sepRow = (
                        <tr key={`sep-${ch}-${chIdx}`}>
                          <td colSpan={12} style={{ padding: 0, border: 'none', height: 10 }} />
                        </tr>
                      );

                      return [...mainRendered, ...bonusRendered, sepRow];
                    });
                  })()}
                </tbody>
            </table>
          </div>
        );
      })}

      {allCommercialKeys.length === 0 && (
        <div style={{ ...s.commercialSub, color: '#718096' }}>No commercial data available.</div>
      )}

        {/* Channel Summary (Single Table) */}
        <h3 style={s.sectionTitle}>Channel Summary (Spot + Property + Bonus)</h3>
        <div style={s.summaryCard}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Channel</th>
                <th style={s.th}>Cost (LKR)</th>
                <th style={s.th}>Property value (LKR)</th>
                <th style={s.th}>Total Cost (LKR)</th>
                <th style={s.th}>NGRP (Spot Buying)</th>
                <th style={s.th}>NGRP (Property)</th>
                <th style={s.th}>Bonus NGRP</th>
                <th style={s.th}>Total NGRP</th>
                <th style={s.th}>CPRP (LKR)</th>
              </tr>
            </thead>
            <tbody>
              {combinedChannelRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, textAlign: 'left' }}>{r.Channel}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Cost_LKR)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Property_LKR)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.TotalCost_LKR)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Spot)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Property)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Bonus)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Total)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.CPRP_LKR)}</td>
                </tr>
              ))}
              {combinedChannelRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...s.td, color: '#718096' }}>No summary available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>


      {/* Actions */}
      <div style={{marginTop: '24px'}}>
        <button type="button" onClick={handleExport} style={s.exportButton}>
          Export Final Plan to Excel
        </button>
        <button type="button" onClick={onHome} style={s.backHomeButton}>
          Go Back to Home
        </button>
      </div>
    </div>
  );
}