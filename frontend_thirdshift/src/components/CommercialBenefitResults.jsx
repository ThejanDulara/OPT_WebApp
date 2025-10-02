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

  const totalCost = result?.totals?.total_cost_incl_property || 0;
  const totalRating = result?.totals?.total_rating || 0;
  const cprp = totalRating > 0 ? totalCost / totalRating : 0;

  const channelSummary = result?.channel_summary || [];
  const commercialsSummary = result?.commercials_summary || [];

  const styles = {
    container: {},
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '24px' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '16px' },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
      marginBottom: '24px'
    },
    summaryCard: {
      marginBottom: '24px',
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
    },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '12px' },
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    buttonRow: { display: 'flex', gap: '16px', marginTop: '32px' },
    primaryButton: {
      padding: '12px 24px',
      backgroundColor: '#4299e1',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer'
    },
    backHomeButton: {
      padding: '12px 24px',
      backgroundColor: '#edf2f7',
      color: '#2d3748',
      border: '1px solid #cbd5e0',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer'
    },
    exportButton: {
      padding: '12px 24px',
      backgroundColor: '#38a169',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      marginRight: '16px'
    },
    resultContainer: { marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e2e8f0' }
  };

  const handleExportToExcel = () => {
    if (!result) {
      alert('No data to export.');
      return;
    }
    const workbook = XLSX.utils.book_new();

    // Commercial sheets
    (commercialsSummary || []).forEach((c, idx) => {
      const ws = XLSX.utils.json_to_sheet(c.details || []);
      XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
    });

    // Channel summary
    if (channelSummary && channelSummary.length > 0) {
      const wsSummary = XLSX.utils.json_to_sheet(channelSummary);
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Channel Summary');
    }

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(fileData, 'commercial_benefit_results.xlsx');
  };

  const displayOrder = [
    'Channel','Program','Day','Time','Slot',
    'Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating','Spots'
  ];

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Commercial Benefit Optimization Results</h2>

      {/* KPI cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>Budget</div>
          <div style={styles.summaryValue}>{formatLKR(totalCost)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>NGRP</div>
          <div style={styles.summaryValue}>{totalRating.toFixed(2)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>CPRP</div>
          <div style={styles.summaryValue}>{cprp ? formatLKR(cprp.toFixed(2)) : '–'}</div>
        </div>
      </div>

      {/* Commercial-wise Allocation */}
      {commercialsSummary.length > 0 && (
        <div style={styles.resultContainer}>
          <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
          {commercialsSummary.map((c, idx) => (
            <div key={idx} style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>Commercial {c.commercial_index + 1}</h4>
              <p>Total Budget: {formatLKR(c.total_cost)}</p>
              <p>NGRP: {Number(c.total_rating).toFixed(2)}</p>
              <p>CPRP: {c.cprp ? formatLKR(c.cprp) : '–'}</p>

              {(c.details || []).length > 0 && (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {displayOrder.map((key, i) => {
                        const headerMap = {
                          'Total_Cost': 'Total Budget',
                          'Total_Rating': 'NGRP'
                        };
                        return <th key={i} style={styles.th}>{headerMap[key] || key}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {c.details.map((row, i) => (
                      <tr key={i}>
                        {displayOrder.map((key, j) => {
                          const val = row[key];
                          const isNum = typeof val === 'number';
                          return (
                            <td
                              key={j}
                              style={{ ...styles.td, textAlign: isNum ? 'right' : 'left' }}
                            >
                              {isNum ? Number(val).toFixed(2) : val}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Channel Summary */}
      {channelSummary.length > 0 && (
        <div style={styles.resultContainer}>
          <h3 style={styles.sectionTitle}>Channel Summary with Slot Breakdown</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                {Object.keys(channelSummary[0]).map((k) => (
                  <th key={k} style={styles.th}>{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channelSummary.map((row, idx) => (
                <tr key={idx}>
                  {Object.values(row).map((val, i) => (
                    <td
                      key={i}
                      style={{
                        ...styles.td,
                        textAlign: typeof val === 'number' ? 'right' : 'left'
                      }}
                    >
                      {typeof val === 'number' ? Number(val).toFixed(2) : val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Buttons */}
      <div style={styles.buttonRow}>
        <button onClick={handleExportToExcel} style={styles.exportButton}>
          Export Results to Excel
        </button>
        <button onClick={onHome} style={styles.backHomeButton}>
          Back to Home
        </button>
        <button
          type="button"
          onClick={onProceedToBonus}
          disabled={!onProceedToBonus}
          style={{ ...styles.primaryButton, opacity: onProceedToBonus ? 1 : 0.6 }}
        >
          Proceed to Bonus Program Optimization
        </button>
      </div>
    </div>
  );
}
