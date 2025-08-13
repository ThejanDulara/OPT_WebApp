import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';



function ChannelRatingAllocator({ channels, dfFull, optimizationInput, onBack }) {
  const [budgetShares, setBudgetShares] = useState({});
  const [maxSpots, setMaxSpots] = useState(optimizationInput.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(optimizationInput.timeLimit || 120);
  const [primePct, setPrimePct] = useState(80);
  const [nonPrimePct, setNonPrimePct] = useState(20);
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const displayOrder = ['Channel', 'Program', 'Day', 'Time', 'Slot',
              'Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'Total_Rating', 'Spots'
            ];
  const summaryOrder = [
          'Channel', 'Total_Cost', '% Cost', 'Total_Rating', '% Rating',
          'Prime Cost','Prime Cost %', 'Non-Prime Cost', 'Non-Prime Cost %', 'Prime Rating', 'Non-Prime Rating',];

  const [budgetProportions, setBudgetProportions] = useState(
    optimizationInput.budgetProportions || Array(optimizationInput.numCommercials).fill((100 / optimizationInput.numCommercials).toFixed(2))
  );

  const handleInputChange = (channel, value) => {
    setBudgetShares(prev => ({
      ...prev,
      [channel]: parseFloat(value)
    }));
  };

  const handleBudgetProportionChange = (index, value) => {
    const updated = [...budgetProportions];
    updated[index] = value;
    setBudgetProportions(updated);
  };

    const handleSubmit = () => {
      const totalChannelPct = Object.values(budgetShares).reduce((a, b) => a + b, 0);
      if (Math.abs(totalChannelPct - 100) > 0.01) {
        alert("Total channel budget % must equal 100%");
        return;
      }

      if (parseFloat(primePct) + parseFloat(nonPrimePct) !== 100) {
        alert("Prime + Non-Prime % must equal 100%");
        return;
      }

      if (optimizationInput.numCommercials > 1) {
        const totalCommPct = budgetProportions.reduce((a, b) => a + parseFloat(b || 0), 0);
        if (Math.abs(totalCommPct - 100) > 0.01) {
          alert("Total commercial budget % must equal 100%");
          return;
        }
      }

      const time = parseInt(timeLimit);
      if (time < 60) {
        alert("⏱ Optimization time limit must be at least 60 seconds.");
        return;
      }

      if (time > 599) {
        const confirmProceed = window.confirm("⚠️ Time limit is over 10 minutes.\nThe server will continue optimizing even if you stop. Proceed?");
        if (!confirmProceed) return;
      }
    const payload = {
      budget_shares: budgetShares,
      df_full: dfFull,
      budget: optimizationInput.budget,
      budget_bound: optimizationInput.budgetBound,
      num_commercials: optimizationInput.numCommercials,
      min_spots: optimizationInput.minSpots,
      max_spots: maxSpots,
      time_limit: timeLimit,
      prime_pct: primePct,
      nonprime_pct: nonPrimePct,
      budget_proportions: budgetProportions.map(p => parseFloat(p))
    };

    setIsProcessing(true);
    setStopRequested(false);

    fetch('https://optwebapp-production.up.railway.app/optimize-by-budget-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (stopRequested) return;

        data.channel_summary = data.channel_summary.map(row => {
          const sortedRow = {};
          summaryOrder.forEach(key => sortedRow[key] = row[key]);
          return sortedRow;
        });

        setResult(data);
        toast.success("✅ Optimization completed! Scroll down to see results.");
        setTimeout(() => {
          const section = document.getElementById("optimization-summary");
          section?.scrollIntoView({ behavior: "smooth" });
        }, 300);
        })
      .catch(() => alert("Optimization failed. Try adjusting your inputs."))
      .finally(() => setIsProcessing(false));
  };

  const handleStop = () => {
    setStopRequested(true);
    setIsProcessing(false);
    alert("⛔ Optimization process manually stopped.");
  };

    const handleExportToExcel = () => {
      if (!result || !result.df_result || result.df_result.length === 0) {
        alert("No data to export.");
        return;
      }

      const workbook = XLSX.utils.book_new();

      const desiredOrder = [
        'Channel', 'Program', 'Day', 'Time', 'Slot',
        'Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'Total_Rating', 'Spots'
      ];

      // Create one sheet per commercial
      result.commercials_summary.forEach((c, idx) => {
        const headerMap = {
          'Total_Cost': 'Total Budget',
          'Total_Rating': 'NGRP',
        };

        const cleanedData = c.details.map(row => {
          const newRow = {};
          desiredOrder.forEach(key => {
            newRow[headerMap[key] || key] = row[key]; // Use mapped key
          });
          return newRow;
        });

        const ws = XLSX.utils.json_to_sheet(cleanedData);
        XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
      });
        // === Summary Sheet ===
      const summaryOrder_ex = [
              'Channel', 'Total_Cost', '% Cost', 'Total_Rating', '% Rating',
              'Prime Cost','Prime Cost %', 'Non-Prime Cost', 'Non-Prime Cost %', 'Prime Rating', 'Non-Prime Rating',];

      const summaryHeaderMap = {
                    'Total_Cost': 'Total Budget',
                    '% Cost': 'Budget %',
                    'Total_Rating': 'NGRP',
                    '% Rating': 'NGRP %',
                    'Prime Cost': 'PT Budget',
                    'Non-Prime Cost': 'NPT Budget',
                    'Prime Rating': 'PT NGRP',
                    'Non-Prime Rating': 'NPT NGRP',
                    'Prime Cost %': 'PT Budget %',
                    'Non-Prime Cost %': 'NPT Budget %',};

      if (result.channel_summary && result.channel_summary.length > 0) {
        const cleanedSummary = result.channel_summary.map(row => {
          const newRow = {};
          summaryOrder_ex.forEach(key => {
            newRow[summaryHeaderMap[key] || key] = row[key];
          });
          return newRow;
        });

        const wsSummary = XLSX.utils.json_to_sheet(cleanedSummary);
        XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');
      }
      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const fileData = new Blob([excelBuffer], { type: "application/octet-stream" });
      saveAs(fileData, "optimized_schedule.xlsx");
    };



  return (
    <div style={styles.container}>
    <ToastContainer position="top-right" autoClose={3000} />
      <h2 style={styles.title}>Allocate Desired Budget Percentage per Channel</h2>

      <div style={styles.channelInputs}>
        {channels.map((ch, idx) => (
          <div key={idx} style={styles.inputGroup}>
            <label style={styles.label}>{ch}:</label>
            <input
              type="number"
              step="0.01"
              value={budgetShares[ch] || ''}
              onChange={e => handleInputChange(ch, e.target.value)}
              style={styles.numberInput}
              min="0"
              max="100"
            />
            <span style={styles.percentSymbol}>%</span>
          </div>
        ))}
      </div>

      <div style={styles.channelInputs}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Prime Time %:</label>
          <input
            type="number"
            step="0.01"
            value={primePct}
            onChange={e => setPrimePct(parseFloat(e.target.value))}
            style={styles.numberInput}
          />
        </div>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Non-Prime Time %:</label>
          <input
            type="number"
            step="0.01"
            value={nonPrimePct}
            onChange={e => setNonPrimePct(parseFloat(e.target.value))}
            style={styles.numberInput}
          />
        </div>
      </div>

      {optimizationInput.numCommercials > 1 && (
        <>
          <h3 style={styles.sectionTitle}>Override Budget percentage per Commercial</h3>
          <div style={styles.channelInputs}>
            {budgetProportions.map((val, idx) => (
              <div key={idx} style={styles.inputGroup}>
                <label style={styles.label}>Commercial {idx + 1}:</label>
                <input
                  type="number"
                  step="0.01"
                  value={val}
                  onChange={e => handleBudgetProportionChange(idx, e.target.value)}
                  style={styles.numberInput}
                />
                <span style={styles.percentSymbol}>%</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '4px', color: '#4a5568', fontSize: '14px' }}>
            💡 Total must be 100% — Current: {budgetProportions.reduce((a, b) => a + parseFloat(b || 0), 0).toFixed(2)}%
          </p>
        </>
      )}

      <div style={styles.maxSpotsContainer}>
        <label style={styles.label}>🔧 Max Spot Bound (Override):</label>
        <input
          type="number"
          min="1"
          value={maxSpots}
          onChange={e => setMaxSpots(parseInt(e.target.value))}
          style={styles.numberInput}
        />
      </div>

      <div style={styles.maxSpotsContainer}>
        <label style={styles.label}>⏱ Optimization Time Limit (seconds):</label>
        <input
          type="number"
          min="10"
          value={timeLimit}
          onChange={e => setTimeLimit(parseInt(e.target.value))}
          style={styles.numberInput}
        />
      </div>

        <div style={styles.buttonRow}>
          {!isProcessing && (
            <>
              <button onClick={onBack} style={styles.backButton}>← Back</button>
              <button onClick={handleSubmit} style={styles.primaryButton}>
                Re-Optimize by Budget Share →
              </button>
            </>
          )}

          {isProcessing && (
            <>
              <p style={styles.processingMsg}>🕒 Optimization is processing. Please wait...</p>
              <button onClick={handleStop} style={styles.stopButton}>
                ⛔ Stop Optimization
              </button>
            </>
          )}
        </div>


      {result && (
      <div id="optimization-summary">
        <div style={styles.resultContainer}>
          <h3 style={styles.sectionTitle}>Final Optimization Result</h3>

          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>Total Budget</h4>
              <p style={styles.summaryValue}>Rs. {result.total_cost.toLocaleString()}</p>
            </div>
            <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>NGRP</h4>
              <p style={styles.summaryValue}>{result.total_rating.toFixed(2)}</p>
            </div>
            <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>CPRP</h4>
              <p style={styles.summaryValue}>{result.cprp.toFixed(2)}</p>
            </div>
          </div>

          <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
          {result.commercials_summary.map((c, idx) => (
            <div key={idx} style={styles.summaryCard}>
              <h4 style={styles.label}>Commercial {c.commercial_index + 1}</h4>
              <p>Total Budget: Rs. {c.total_cost.toLocaleString()}</p>
              <p>NGRP: {c.total_rating.toFixed(2)}</p>
              <p>CPRP: {c.cprp.toFixed(2)}</p>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {displayOrder.map((key, i) => {
                      const headerMap = {
                        'Total_Rating': 'NGRP',
                        'Total_Cost': 'Total Budget',
                        // Add more mappings as needed
                      };
                      return (
                        <th key={i} style={styles.th}>
                          {headerMap[key] || key}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                {c.details.map((row, i) => (
                  <tr key={i}>
                    {displayOrder.map((key, j) => {
                      const numericCols = ['Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'Total_Rating'];
                      const isNumeric = numericCols.includes(key);

                      return (
                        <td
                          key={j}
                          style={{
                            ...styles.td,
                            textAlign: ['Spots', 'Slot'].includes(key) ? 'center' : isNumeric ? 'right' : 'left'
                          }}
                        >
                          {isNumeric
                          ? ['Spots'].includes(key)
                            ? parseInt(row[key])
                            : parseFloat(row[key]).toFixed(2)
                          : row[key]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody></table>
            </div>
          ))}

            <h3 style={styles.sectionTitle}>Channel Summary with Slot Breakdown</h3>
            <table style={styles.summaryCard}>
            <thead>
              <tr>
                {summaryOrder.map((key, i) => {
                  const headerMap = {
                    'Total_Cost': 'Total Budget',
                    '% Cost': 'Budget %',
                    'Total_Rating': 'NGRP',
                    '% Rating': 'NGRP %',
                    'Prime Cost': 'PT Budget',
                    'Non-Prime Cost': 'NPT Budget',
                    'Prime Rating': 'PT NGRP',
                    'Non-Prime Rating': 'NPT NGRP',
                    'Prime Cost %': 'PT Budget %',
                    'Non-Prime Cost %': 'NPT Budget %',
                  };
                  return (
                    <th key={i} style={styles.th}>
                      {headerMap[key] || key}
                    </th>
                  );
                })}
              </tr>
            </thead>
              <tbody>
                {result.channel_summary.map((row, i) => (
                  <tr key={i}>
                    {summaryOrder.map((key, j) => {
                      const isNumeric = typeof row[key] === 'number';
                      return (
                        <td
                          key={j}
                          style={{
                            ...styles.td,
                            textAlign: isNumeric ? 'right' : 'left'
                          }}
                        >
                          {isNumeric ? row[key].toFixed(2) : row[key]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

          <button onClick={handleExportToExcel} style={styles.exportButton}>📥 Export Final Plan to Excel</button>
          <button onClick={() => window.location.href = '/'} style={styles.backHomeButton}>⬅️ Go Back to Home </button>
       </div>
      </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#d5e9f7',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
  },
  title: {
    color: '#2d3748',
    fontSize: '24px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  channelInputs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  label: {
    color: '#4a5568',
    fontWeight: '500',
    fontSize: '14px',
  },
  numberInput: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    width: '100px',
    fontSize: '14px',
  },
  percentSymbol: {
    color: '#4a5568',
    fontSize: '14px',
  },
  maxSpotsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  buttonRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
  },
  backButton: {
    padding: '12px 24px',
    backgroundColor: '#edf2f7',
    color: '#2d3748',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  primaryButton: {
    padding: '12px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  resultContainer: {
    marginTop: '32px',
    paddingTop: '32px',
    borderTop: '1px solid #e2e8f0',
  },
  sectionTitle: {
    color: '#2d3748',
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  summaryTitle: {
    color: '#4a5568',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  summaryValue: {
    color: '#2d3748',
    fontSize: '18px',
    fontWeight: '700',
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
    transition: 'all 0.2s ease',
    marginTop: '24px',
  },
  processingMsg: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#718096',
    marginTop: '4px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '16px'
  },
  th: {
    border: '1px solid #ccc',
    padding: '8px',
    background: '#f7fafc',
    fontWeight: '600'
  },
  td: {
    border: '1px solid #eee',
    padding: '8px',
    textAlign: 'center'
  },
  stopButton: {
    padding: '12px 20px',
    backgroundColor: '#e53e3e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  backHomeButton: {
  padding: '12px 24px',
  backgroundColor: '#edf2f7',
  color: '#2d3748',
  border: '1px solid #cbd5e0',
  borderRadius: '6px',
  fontSize: '16px',
  fontWeight: '500',
  cursor: 'pointer',
  marginTop: '16px',
  }
};

export default ChannelRatingAllocator;
