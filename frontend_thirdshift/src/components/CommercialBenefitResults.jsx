// src/components/CommercialBenefitResults.jsx
import React from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function CommercialBenefitResults({
  result,
  onProceedToBonus,
  onHome,
  formatLKR
}) {
  if (!result) return null;

  // ✅ Fixed KPI card data sources
  const totalCost =
    result?.total_cost ||
    result?.totals?.total_cost_incl_property ||
    0;
  const totalRating =
    result?.total_rating ||
    result?.totals?.total_rating ||
    0;

        // ---- TOTAL GRP ----
    const totalGRP = (result?.commercials_summary || [])
      .flatMap(c => c.details || [])
      .reduce((sum, r) => sum + (Number(r.TVR || 0) * Number(r.Spots || 0)), 0);

  const cprp = totalRating > 0 ? totalCost / totalRating : 0;

  const channelSummary = result?.tables?.by_channel || [];
  const commercialsSummary = result?.commercials_summary || [];

  // DEBUG
  console.log("Channel Summary Data:", channelSummary);

  // Define styles similar to OptimizationResults
  const styles = {
    container: { marginTop: '24px', padding: '32px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '24px' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '24px' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' },
    summaryCard: { marginBottom: '24px', backgroundColor: 'white', borderRadius: '8px', padding: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' , backgroundColor: 'white'},
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center',background: 'white' },
    exportButton: { padding: '12px 24px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', marginTop: '24px', marginRight: '20px' },
    backHomeButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px', marginRight: '20px' },
    primaryButton: { padding: '12px 24px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },
    tableContainer: { overflowX: 'auto', borderRadius: '8px', marginTop: '0 table:' },
    deviationWarning: { background: '#fff5f5', color: '#c53030' },
    note: { fontSize: '13px', color: '#666', marginTop: '12px', fontStyle: 'italic', textAlign: 'center' }
  };

  // Helper for deviation styling
  const getDeviationStyle = (actual, target) => {
    if (!target || actual === 0) return {};
    const diff = Math.abs(actual - target);
    return diff > 5 ? styles.deviationWarning : {};
  };

  // Helper function for numeric formatting
  const toFixedOrInt = (key, val) => {
    const numericCols = ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'];
    const isNumeric = numericCols.includes(key);
    const isCount = key === 'Spots';
    if (isCount) return parseInt(val);
    if (isNumeric) return Number(val).toFixed(2);
    return val;
  };

// =========================
//  EXPORT TO EXCEL — FINAL FIXED VERSION
//  (A1–A5 %, B %, PT %, NPT % correctly populated)
// =========================
const handleExportToExcel = () => {
  const wb = XLSX.utils.book_new();

  // ---- GRP PER CHANNEL ----
  const grpByChannel = channelSummary.reduce((acc, row) => {
    const ch = row.Channel;

    const details = (commercialsSummary || [])
      .flatMap(c => c.details || [])
      .filter(r => r.Channel === ch);

    const grp = details.reduce(
      (s, r) => s + Number(r.TVR || 0) * Number(r.Spots || 0),
      0
    );

    acc[ch] = grp;
    return acc;
  }, {});

  const totalGRP = Object.values(grpByChannel).reduce((a, b) => a + b, 0);


  // ==============================
  // 1) CHANNEL SUMMARY — MATCH UI EXACTLY
  // ==============================
  const channelData = channelSummary.map(row => {
    const ch = row.Channel;
    const grp = grpByChannel[ch] || 0;
    const grpPct = totalGRP > 0 ? (grp / totalGRP) * 100 : 0;

    const total = row.Total_Cost || 0;

    // replicate UI logic for percentages
    const pct = (amount) =>
      total > 0 ? ((amount / total) * 100).toFixed(2) + "%" : "0.00%";

    // cost breakdown
    const A1 = row["A1 Cost"] || 0;
    const A2 = row["A2 Cost"] || 0;
    const A3 = row["A3 Cost"] || 0;
    const A4 = row["A4 Cost"] || 0;
    const A5 = row["A5 Cost"] || 0;
    const B  = row["B Cost"]  || 0;
    const PT = row["Prime Cost"] || 0;
    const NPT = row["Non-Prime Cost"] || 0;

    return {
      Channel: ch,
      "Total Budget": row.Total_Cost,
      "Budget %": row["% Cost"]?.toFixed(2) + "%",

      GRP: grp.toFixed(2),
      "GRP %": grpPct.toFixed(2) + "%",

      NGRP: row.Total_Rating?.toFixed(2),
      "NGRP %": row["% Rating"]?.toFixed(2) + "%",

      // calculated A1–A5 percentages
      "A1 %": pct(A1),
      "A2 %": pct(A2),
      "A3 %": pct(A3),
      "A4 %": pct(A4),
      "A5 %": pct(A5),

      // B %
      "B %": pct(B),

      // total PT/NPT %
      "PT %": pct(PT),
      "NPT %": pct(NPT)
    };
  });

  const wsChannel = XLSX.utils.json_to_sheet(channelData);
  XLSX.utils.book_append_sheet(wb, wsChannel, "Channel Summary");


  // ==============================
  // 2) COMMERCIAL SHEETS — MATCH UI EXACTLY
  // ==============================
  commercialsSummary.forEach((c, idx) => {
    const rows = (c.details || []).map(r => ({
      Channel: r.Channel,
      Program: r.Program,
      Day: r.Day,
      Time: r.Time,
      Slot: r.Slot,
      Cost: Number(r.Cost || 0).toFixed(2),
      TVR: Number(r.TVR || 0).toFixed(2),
      NCost: Number(r.NCost || 0).toFixed(2),
      NTVR: Number(r.NTVR || 0).toFixed(2),
      Total_Cost: Number(r.Total_Cost || 0).toFixed(2),
      GRP: (Number(r.TVR || 0) * Number(r.Spots || 0)).toFixed(2),
      Total_Rating: Number(r.Total_Rating || 0).toFixed(2),
      Spots: r.Spots
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Commercial ${idx + 1}`);
  });


  // ==============================
  // 3) SAVE FILE
  // ==============================
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/octet-stream",
  });
  saveAs(blob, "Commercial_Benefit_Optimization_Results.xlsx");
};


    // ---- GRP PER CHANNEL ----
    const grpByChannel = channelSummary.reduce((acc, row) => {
      const channel = row.Channel;
      const details = (result?.commercials_summary || [])
        .flatMap(c => c.details || [])
        .filter(r => r.Channel === channel);

      const grp = details.reduce(
        (s, r) => s + Number(r.TVR || 0) * Number(r.Spots || 0),
        0
      );

      acc[channel] = grp;
      return acc;
    }, {});

    // Total for GRP%
    const totalGRPForPct = Object.values(grpByChannel)
      .reduce((a, b) => a + b, 0);


  return (
    <div id="commercial-benefit-summary" >
        <h3 style={styles.sectionTitle}>Commercial Benefit Optimization Results</h3>

        {/* KPI Cards */}
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>Optimized Budget </h4>
            <p style={styles.summaryValue}>{formatLKR(totalCost)}</p>
          </div>
             <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>GRP</h4>
              <p style={styles.summaryValue}>{totalGRP.toFixed(2)}</p>
            </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>NGRP</h4>
            <p style={styles.summaryValue}>{totalRating.toFixed(2)}</p>
          </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>CPRP</h4>
            <p style={styles.summaryValue}>{formatLKR(cprp.toFixed(2))}</p>
          </div>
        </div>

        {/* Channel Summary */}
        <h3 style={styles.sectionTitle}>Channel wise PT/NPT Breakdown</h3>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Channel</th>
                <th style={styles.th}>Total Budget</th>
                <th style={styles.th}>Budget %</th>
                <th style={styles.th}>GRP</th>
                <th style={styles.th}>GRP %</th>
                <th style={styles.th}>NGRP</th>
                <th style={styles.th}>NGRP %</th>
                <th style={styles.th}>A1 %</th>
                <th style={styles.th}>A2 %</th>
                <th style={styles.th}>A3 %</th>
                <th style={styles.th}>A4 %</th>
                <th style={styles.th}>A5 %</th>
                <th style={styles.th}>B %</th>
                <th style={styles.th}>PT %</th>
                <th style={styles.th}>NPT %</th>
              </tr>
            </thead>
            <tbody>
              {channelSummary.map((row, i) => {
                const isHiru = row.Channel === 'HIRU TV';
                const total = row.Total_Cost || 0;
                const pct = (cost) =>
                  total > 0 ? ((cost / total) * 100).toFixed(2) : '0.00';

                const slotCosts = {
                  A1: row['A1 Cost'] || 0,
                  A2: row['A2 Cost'] || 0,
                  A3: row['A3 Cost'] || 0,
                  A4: row['A4 Cost'] || 0,
                  A5: row['A5 Cost'] || 0,
                  B: row['B Cost'] || 0,
                  Prime: row['Prime Cost'] || 0,
                  NonPrime: row['Non-Prime Cost'] || 0,
                };

                const target =
                  window.__COMMERCIAL_BENEFIT_TARGETS?.[row.Channel] || {
                    A1: 16,
                    A2: 16,
                    A3: 16,
                    A4: 16,
                    A5: 16,
                    B: 20,
                  };

                return (
                  <tr key={i}>
                    <td style={{ ...styles.td, fontWeight: 600, background: isHiru ? '#e6f7ff' : '#f8fafc' }}>
                      {row.Channel}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {formatLKR(total)}
                    </td>
                    <td style={styles.td}>
                      {row['% Cost']?.toFixed(2) || '0.00'}%
                    </td>
                    <td style={styles.td}>
                      {grpByChannel[row.Channel]?.toFixed(2) || '0.00'}
                    </td>

                    <td style={styles.td}>
                      {totalGRPForPct > 0
                        ? ((grpByChannel[row.Channel] / totalGRPForPct) * 100).toFixed(2)
                        : '0.00'}%
                    </td>
                    <td style={styles.td}>
                      {row.Total_Rating?.toFixed(2) || '0.00'}
                    </td>
                    <td style={styles.td}>
                      {row['% Rating']?.toFixed(2) || '0.00'}%
                    </td>

                    {isHiru ? (
                      <>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.A1), target.A1) }}>
                          {pct(slotCosts.A1)}%
                        </td>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.A2), target.A2) }}>
                          {pct(slotCosts.A2)}%
                        </td>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.A3), target.A3) }}>
                          {pct(slotCosts.A3)}%
                        </td>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.A4), target.A4) }}>
                          {pct(slotCosts.A4)}%
                        </td>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.A5), target.A5) }}>
                          {pct(slotCosts.A5)}%
                        </td>
                        <td style={{ ...styles.td, ...getDeviationStyle(pct(slotCosts.B), target.B), background: '#fff1f0' }}>
                          {pct(slotCosts.B)}%
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} style={{ ...styles.td, color: '#999', fontStyle: 'italic' }}>
                        —
                      </td>
                    )}

                    <td style={{ ...styles.td, background: '#e6f7ff' }}>
                      {pct(slotCosts.Prime)}%
                    </td>
                    <td style={{ ...styles.td, background: '#fff1f0' }}>
                      {pct(slotCosts.NonPrime)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={styles.note}>
          Red background = deviation > ±5% from target. A1–A5 breakdown shown
          only for HIRU TV.
        </div>

        {/* Commercial-wise Allocation */}
        {commercialsSummary.length > 0 && (
          <>
            <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
            {commercialsSummary.map((c, idx) => (
              <div key={idx} style={styles.summaryCard}>
                <h4 style={styles.label}>Commercial {c.commercial_index + 1}</h4>
                <div style={{
                  marginBottom: '12px',
                  fontSize: '16px'
                }}>
                  <strong>Total Budget:</strong> {formatLKR(c.total_cost)} &nbsp;  &nbsp;
                  <strong>GRP:</strong> {(c.details || []).reduce((s, r) => s + Number(r.TVR || 0) * Number(r.Spots || 0), 0).toFixed(2)} &nbsp;  &nbsp;
                  <strong>NGRP:</strong> {Number(c.total_rating).toFixed(2)} &nbsp;  &nbsp;
                  <strong>CPRP:</strong> {Number(c.cprp).toFixed(2)}
                </div>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {[
                        'Channel',
                        'Program',
                        'Day',
                        'Time',
                        'Slot',
                        'Cost',
                        'TVR',
                        'NCost',
                        'NTVR',
                        'Total_Cost',
                        'GRP',
                        'Total_Rating',
                        'Spots'
                    ].map((key, i) => {
                      const headerNames = {
                        Slot: 'PT [A] / NPT [B]',
                        Total_Cost: 'Budget',
                        Total_Rating: 'NGRP'
                      };
                      const displayName = headerNames[key] || key;
                      return <th key={i} style={styles.th}>{displayName}</th>;
                    })}
                    </tr>
                  </thead>
                  <tbody>
                    {(c.details || []).map((row, i) => (
                      <tr key={i}>
                        {[
                          'Channel',
                          'Program',
                          'Day',
                          'Time',
                          'Slot',
                          'Cost',
                          'TVR',
                          'NCost',
                          'NTVR',
                          'Total_Cost',
                          'GRP',
                          'Total_Rating',
                          'Spots'
                        ].map((key, j) => (
                            <td
                              key={j}
                              style={{
                                ...styles.td,
                                textAlign: ['Spots','Slot'].includes(key)
                                  ? 'center'
                                  : ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating','GRP'].includes(key)
                                  ? 'right'
                                  : 'left'
                              }}
                            >
                              {key === 'GRP'
                                ? (Number(row.TVR || 0) * Number(row.Spots || 0)).toFixed(2)
                                : toFixedOrInt(key, row[key])
                              }
                            </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {/* Action Buttons */}
        <button onClick={handleExportToExcel} style={styles.exportButton}>
          Export to Excel
        </button>

        <button
          onClick={onProceedToBonus}
          style={styles.primaryButton}
        >
          Proceed to Bonus Optimization
        </button>
    </div>
  );
}