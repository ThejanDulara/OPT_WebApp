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
  const cprp = totalRating > 0 ? totalCost / totalRating : 0;

  const channelSummary = result?.tables?.by_channel || [];
  const commercialsSummary = result?.commercials_summary || [];

  // DEBUG
  console.log("Channel Summary Data:", channelSummary);

  const styles = {
    container: { padding: '32px', background: '#f8fafc', borderRadius: 12 },
    title: { color: '#2d3748', fontSize: '28px', fontWeight: 700, marginBottom: 24, textAlign: 'center' },
    section: { marginTop: 32, background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
    sectionTitle: { fontSize: 22, fontWeight: 600, color: '#2d3748', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #4299e1' },
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20, marginBottom: 32 },
    kpiCard: { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: 20, borderRadius: 10, textAlign: 'center' },
    kpiLabel: { fontSize: 14, opacity: 0.9 },
    kpiValue: { fontSize: 28, fontWeight: 700, marginTop: 8 },
    tableContainer: { overflowX: 'auto', borderRadius: 8, marginTop: 16 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { background: '#f8fafc', padding: '14px 12px', textAlign: 'center', fontWeight: 600, borderBottom: '2px solid #4299e1', color: '#2d3748' },
    td: { padding: '12px', borderBottom: '1px solid #e2e8f0', textAlign: 'center' },
    deviationWarning: { background: '#fff5f5', color: '#c53030' },
    buttonRow: { display: 'flex', justifyContent: 'center', gap: 16, marginTop: 40, flexWrap: 'wrap' },
    primaryButton: { padding: '14px 32px', background: '#4299e1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(66,153,225,0.3)' },
    successButton: { padding: '14px 32px', background: '#38a169', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
    secondaryButton: { padding: '14px 32px', background: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' },
    note: { fontSize: 13, color: '#666', marginTop: 12, fontStyle: 'italic', textAlign: 'center' },
    summaryCard: { marginBottom: 24, padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' },
    summaryTitle: { fontSize: 18, fontWeight: 600, color: '#4299e1', marginBottom: 8 }
  };

  // Helper for deviation styling
  const getDeviationStyle = (actual, target) => {
    if (!target || actual === 0) return {};
    const diff = Math.abs(actual - target);
    return diff > 5 ? styles.deviationWarning : {};
  };

  // Export to Excel
  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const channelData = channelSummary.map(row => ({
      Channel: row.Channel,
      'Total Budget': row.Total_Cost,
      'Budget %': row['% Cost'],
      NGRP: row.Total_Rating,
      'NGRP %': row['% Rating'],
      'PT Budget': row['Prime Cost'],
      'NPT Budget': row['Non-Prime Cost'],
      'A1 Cost': row['A1 Cost'] || 0,
      'A2 Cost': row['A2 Cost'] || 0,
      'A3 Cost': row['A3 Cost'] || 0,
      'A4 Cost': row['A4 Cost'] || 0,
      'A5 Cost': row['A5 Cost'] || 0,
      'B Cost': row['B Cost'] || 0,
    }));
    const wsChannel = XLSX.utils.json_to_sheet(channelData);
    XLSX.utils.book_append_sheet(wb, wsChannel, 'Channel Summary');

    commercialsSummary.forEach((c, i) => {
      const ws = XLSX.utils.json_to_sheet(c.details || []);
      XLSX.utils.book_append_sheet(wb, ws, `Commercial ${i + 1}`);
    });

    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'Commercial_Benefit_Optimization_Results.xlsx');
  };

  // Display order for commercial detail tables
  const displayOrder = [
    'Channel',
    'Program',
    'Slot',
    'Spots',
    'Total_Cost',
    'Total_Rating'
  ];

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Commercial Benefit Optimization Results</h2>

      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Budget Used</div>
          <div style={styles.kpiValue}>{formatLKR(totalCost)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total NGRP</div>
          <div style={styles.kpiValue}>{totalRating.toFixed(2)}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>CPRP</div>
          <div style={styles.kpiValue}>{formatLKR(cprp.toFixed(2))}</div>
        </div>
      </div>

      {/* Channel Summary */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Channel Summary with Slot Breakdown</h3>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Channel</th>
                <th style={styles.th}>Total Budget</th>
                <th style={styles.th}>Budget %</th>
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
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? '#fdfdfe' : '#fff' }}
                  >
                    <td
                      style={{
                        ...styles.td,
                        fontWeight: 600,
                        background: isHiru ? '#e6f7ff' : '#f8fafc',
                      }}
                    >
                      {row.Channel}
                    </td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>
                      {formatLKR(total)}
                    </td>
                    <td style={styles.td}>
                      {row['% Cost']?.toFixed(2) || '0.00'}%
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
      </div>

{/* ✅ Restored Commercial-wise Allocation with detail tables */}
{commercialsSummary.length > 0 && (
  <div style={{ background: '#e7f1fb', borderRadius: 8, padding: 24, marginTop: 32 }}>
    <h3 style={{ fontSize: 20, fontWeight: 600, color: '#2d3748', marginBottom: 16 }}>
      Commercial-wise Allocation
    </h3>

    {commercialsSummary.map((c, idx) => (
      <div
        key={idx}
        style={{
          background: 'white',
          borderRadius: 8,
          padding: 20,
          marginBottom: 24,
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        }}
      >
        <h4 style={{ fontSize: 16, fontWeight: 600, color: '#2b6cb0', marginBottom: 8 }}>
          Commercial {c.commercial_index + 1}
        </h4>
        <p style={{ margin: '4px 0', color: '#2d3748' }}>
          <strong>Total Budget:</strong> {formatLKR(c.total_cost)}
        </p>
        <p style={{ margin: '4px 0', color: '#2d3748' }}>
          <strong>NGRP:</strong> {Number(c.total_rating).toFixed(2)}
        </p>
        <p style={{ margin: '4px 0', color: '#2d3748', marginBottom: 12 }}>
          <strong>CPRP:</strong> {Number(c.cprp).toFixed(2)}
        </p>

        {(c.details || []).length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginTop: 8,
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
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
                    'Total Budget',
                    'NGRP',
                    'Spots'
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        border: '1px solid #e2e8f0',
                        padding: '8px',
                        fontWeight: 600,
                        textAlign: 'center',
                        color: '#2d3748'
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.details.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fdfdfd' : '#ffffff' }}>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px' }}>{row.Channel}</td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'left' }}>{row.Program}</td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px' }}>{row.Day}</td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px' }}>{row.Time}</td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'center' }}>{row.Slot}</td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.Cost).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.TVR).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.NCost).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.NTVR).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.Total_Cost).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'right' }}>
                      {Number(row.Total_Rating).toFixed(2)}
                    </td>
                    <td style={{ border: '1px solid #edf2f7', padding: '6px 8px', textAlign: 'center' }}>
                      {parseInt(row.Spots || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    ))}
  </div>
)}


      {/* Action Buttons */}
      <div style={styles.buttonRow}>
        <button onClick={handleExportToExcel} style={styles.successButton}>
          Export to Excel
        </button>
        <button onClick={onHome} style={styles.secondaryButton}>
          Back to Home
        </button>
        <button onClick={onProceedToBonus} style={styles.primaryButton}>
          Proceed to Bonus Optimization
        </button>
      </div>
    </div>
  );
}
