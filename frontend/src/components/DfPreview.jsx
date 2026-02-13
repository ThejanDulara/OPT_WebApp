import React, { useEffect, useState, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

function DfPreview({ programIds, optimizationInput, onReady, goBack, negotiatedRates, channelDiscounts, selectedTG, selectedClient, manualOverride }) {
  const [dfFull, setDfFull] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [optimizationFailed, setOptimizationFailed] = useState(false);

  // Define column orders and name mappings
  const previewOrder = ['Commercial', 'Channel', 'Day', 'Time', 'Program', 'Cost', 'Negotiated_Rate', 'TVR', 'Slot', 'NCost', 'NTVR'];
  const displayOrder = ['Channel', 'Program', 'Day', 'Time', 'Slot', 'Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'GRP', 'Total_Rating', 'Spots'];
  const channelSummaryOrder = ['Channel', 'Total_Cost', '% of Total'];

  const columnNameMappings_1 = {
    'Cost': 'Rate card (30 Sec)',
    'Negotiated_Rate': 'Neg. Rate (30 Sec)',
    'Slot': 'PT [A] / NPT [B]'
  };

  const columnNameMappings_2 = {
    'Total_Cost': 'Total Budget',
    'Total_Rating': 'NGRP',
    'Slot': 'PT [A] / NPT [B]'
  };

  const columnNameMappings = {
    'Total_Cost': 'Total Budget (LKR)',
    'Total_Rating': 'NGRP',
  };

  const bottomRef = useRef(null);

  const goDown = () => {
    const summary = document.getElementById('optimization-summary');
    if (summary) summary.scrollIntoView({ behavior: 'smooth' });
    else bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  useEffect(() => {
    if (!programIds || !programIds.length || !optimizationInput) {
      setLoading(false);
      return;
    }

    const payload = {
      program_ids: programIds,
      num_commercials: optimizationInput.numCommercials,
      durations: optimizationInput.durations,
      negotiated_rates: negotiatedRates,       // { [programId]: number }
      channel_discounts: channelDiscounts,      // { [channel]: number }
      manual_override: manualOverride,          // { [programId]: boolean } - PASS THIS
      target_group: selectedTG || "tvr_all",
      selected_client: selectedClient || "Other",
    };

    fetch('https://optwebapp-production-60b4.up.railway.app/generate-df', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        // PATCH: Ensure negotiated rates match the frontend state (overrides)
        // explicitly, in case backend recalculated them.
        const rawDf = data.df_full || [];

        const patchedDf = rawDf.map(row => {
          // Attempt to resolve ID
          const rowId = row.id ?? row.ProgramId ?? row.ID;

          if (rowId && negotiatedRates[rowId] !== undefined) {
            const frontendRate = parseFloat(negotiatedRates[rowId]);

            // Check if backend value is significantly different (tolerance for float math)
            const backendRate = parseFloat(row.Negotiated_Rate || 0);

            if (Math.abs(frontendRate - backendRate) > 0.01) {
              // If different, prefer frontend (user override/state)
              // We also update NCost to match Negotiated_Rate assuming NCost in this table context
              // often reflects the effective negotiated rate unit cost.
              // NOTE: If NCost is duration-adjusted, this simple overwrite might be slightly off
              // if duration != 30, but usually DfPreview shows 30-sec rates or consistent units.
              // Given "Neg. Rate (30 Sec)" header mapping, Negotiated_Rate is definitely 30s.
              // If NCost is different, it might be spot cost.
              // Let's just update Negotiated_Rate which is the key 30-sec anchor.
              return {
                ...row,
                Negotiated_Rate: frontendRate,
                // Optional: if NCost exists and equals old Negotiated Rate, update it too
                NCost: (Math.abs(parseFloat(row.NCost) - backendRate) < 0.01) ? frontendRate : row.NCost
              };
            }
          }
          return row;
        });

        setDfFull(patchedDf);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching DF:", err);
        setError('Failed to fetch optimization table');
        setLoading(false);
      });
  }, [programIds, optimizationInput, selectedClient, negotiatedRates]); // Added negotiatedRates to deps

  const handleStartOptimization = () => {
    setIsProcessing(true);
    setStopRequested(false);
    setOptimizationFailed(false);
    setResult(null);

    const payload = {
      df_full: dfFull,
      budget: optimizationInput.budget,
      budget_bound: optimizationInput.budgetBound,
      min_spots: optimizationInput.minSpots,
      max_spots: optimizationInput.maxSpots,
      num_commercials: optimizationInput.numCommercials,
      time_limit: optimizationInput.timeLimit || 120
    };

    fetch('https://optwebapp-production-60b4.up.railway.app/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (stopRequested) {
          toast.warn('⛔ Optimization stopped by user.');
          return;
        }

        if (data.success) {
          toast.success('Optimization succeeded! Scroll down to see results.');
          setResult(data);
          setTimeout(() => {
            const section = document.getElementById("optimization-summary");
            section?.scrollIntoView({ behavior: "smooth" });
          }, 300);
        } else {
          setOptimizationFailed(true);
          toast.warning(data.message || '⚠️ Optimization failed. Adjust constraints and try again.');
        }
      })
      .catch(() => {
        if (!stopRequested) {
          toast.error('❌ Optimization failed due to server error.');
        }
        setOptimizationFailed(true);
      })
      .finally(() => setIsProcessing(false));
  };

  const handleStop = () => {
    setStopRequested(true);
    setIsProcessing(false);
    toast.warn('⛔ Optimization process manually stopped.');
  };

  const handleExportToExcel = () => {
    if (!result || !result.commercials_summary || result.commercials_summary.length === 0) {
      alert("No data to export.");
      return;
    }

    const workbook = XLSX.utils.book_new();

    // Create one sheet per commercial
    result.commercials_summary.forEach((c, idx) => {
      const cleanedData = c.details.map(row => {
        const newRow = {};
        displayOrder.forEach(key => {
          if (row.hasOwnProperty(key)) {
            newRow[columnNameMappings[key] || key] = row[key];
          }
        });
        return newRow;
      });

      const ws = XLSX.utils.json_to_sheet(cleanedData);
      XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
    });

    // Add the final summary sheet
    if (result.channel_summary && result.channel_summary.length > 0) {
      const summaryData = result.channel_summary.map(row => {
        return {
          'Channel': row.Channel,
          'Total Budget': row.Total_Cost,
          'Budget %': row['% of Total']
        };
      });
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');
    }

    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const fileData = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(fileData, "optimized_schedule.xlsx");
  };

  if (loading) return <div style={styles.loading}>Loading optimization table...</div>;
  if (error) return <div style={styles.error}>{error}</div>;

  if (!programIds || !programIds.length || !optimizationInput) {
    return (
      <div style={styles.error}>
        <h3>No Optimization Data Found</h3>
        <p>Please go back and ensure you have selected programs and configured optimization settings.</p>
        <button onClick={goBack} style={styles.backButton}>Go Back</button>
      </div>
    );
  }

  const totalGRP = (result?.commercials_summary || [])
    .flatMap(c => c.details || [])
    .reduce((sum, row) => sum + ((row.Spots || 0) * (row.TVR || 0)), 0);

  return (
    <div style={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <h2 style={styles.title}>Optimization-Ready Table</h2>
      <div style={styles.toolbar}>
        <button type="button" onClick={goDown} style={styles.backButton_2}>
          Go Down
        </button>
      </div>

      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              {previewOrder.map((col, i) => {
                const displayName = columnNameMappings_1[col] || col;
                return (
                  <th key={i} style={styles.th}>{displayName}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dfFull.map((row, idx) => (
              <tr key={idx} style={idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                {previewOrder.map((col, i) => {
                  let val = row[col];
                  const isNumeric = ['Cost', 'TVR', 'NCost', 'NTVR', 'Negotiated_Rate'].includes(col);
                  if (isNumeric) {
                    val = typeof val === 'number' ? val.toFixed(2) : parseFloat(val || 0).toFixed(2);
                  }
                  return (
                    <td
                      key={i}
                      style={{
                        ...styles.td,
                        textAlign: ['Commercial', 'Slot'].includes(col)
                          ? 'center'
                          : isNumeric
                            ? 'right'
                            : 'left'
                      }}
                    >
                      {val}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div ref={bottomRef} />
      <div style={styles.buttonRow}>
        {!isProcessing && (
          <>
            <button onClick={goBack} style={styles.backButton}>
              Go Back
            </button>
            <button onClick={handleStartOptimization} style={styles.primaryButton}>
              Start Optimization
            </button>
          </>
        )}

        {isProcessing && (
          <>
            <p style={styles.processingMsg}>Optimization is processing. Please wait...</p>
            <button onClick={handleStop} style={styles.stopButton}>
              Stop Optimization
            </button>
          </>
        )}
      </div>

      {!isProcessing && optimizationFailed && (
        <div style={styles.notificationBox}>
          <p>Optimization failed or returned no solution.</p>
          <button onClick={goBack} style={styles.backButton}>
            Go Back
          </button>
        </div>
      )}

      {result && (
        <div style={styles.resultContainer} id="optimization-summary">
          <h2 style={styles.sectionTitle}>Optimization Summary</h2>

          <div style={styles.summaryGrid}>
            <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>Optimized Budget</h4>
              <p style={styles.summaryValue}>LKR {result.total_cost.toLocaleString()}</p>
            </div>
            <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>GRP</h4>
              <p style={styles.summaryValue}>{totalGRP.toFixed(2)}</p>
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
            <div key={idx} style={styles.commercialCard}>
              <h4 style={styles.commercialTitle}>Commercial {c.commercial_index + 1}</h4>
              <div style={styles.commercialSummary}>
                <p>Total Budget: LKR {c.total_cost.toLocaleString()}</p>
                <p>GRP: {c.details.reduce((s, r) => s + r.Spots * r.TVR, 0).toFixed(2)}</p>
                <p>NGRP: {c.total_rating.toFixed(2)}</p>
                <p>CPRP: {c.cprp.toFixed(2)}</p>
              </div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {displayOrder.map((key, i) => {
                      const displayName = columnNameMappings_2[key] || key;
                      return (
                        <th key={i} style={styles.th}>{displayName}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {c.details.map((row, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                      {displayOrder.map((key, j) => {
                        const isNumeric = ['Cost', 'TVR', 'NCost', 'NTVR', 'Total_Cost', 'Total_Rating', 'GRP'].includes(key);
                        const val =
                          key === 'GRP'
                            ? (row.Spots * row.TVR).toFixed(2)
                            : isNumeric && typeof row[key] === 'number'
                              ? row[key].toFixed(2)
                              : row[key];
                        return (
                          <td
                            key={j}
                            style={{
                              ...styles.td,
                              textAlign: ['Spots', 'Slot'].includes(key) ? 'center' : isNumeric ? 'right' : 'left'
                            }}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <h3 style={styles.sectionTitle}>Channel-wise Spending</h3>
          <div style={styles.smallTableContainer}>
            <table style={styles.smallTable}>
              <thead>
                <tr>
                  {channelSummaryOrder.map((key, i) => {
                    const displayName = columnNameMappings[key] || key;
                    return (
                      <th key={i} style={styles.th}>{displayName}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {result.channel_summary.map((row, i) => (
                  <tr key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
                    <td style={{ ...styles.td, textAlign: 'left' }}>{row.Channel}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{parseFloat(row.Total_Cost).toLocaleString()}</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{row['% of Total']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.buttonRow}>
            <button onClick={handleExportToExcel} style={styles.exportButton}>
              Export Plan to Excel
            </button>
            <button onClick={() => onReady(dfFull)} style={styles.primaryButton}>
              Proceed to Channel Share Optimization
            </button>
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
    marginBottom: '2px',
  },
  tableContainer: {
    overflowX: 'auto',
    marginBottom: '24px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: 'white',
  },
  smallTableContainer: {
    width: 'fit-content',
    marginBottom: '24px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: 'white',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  smallTable: {
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px',
    backgroundColor: '#f7fafc',
    fontWeight: '600',
    textAlign: 'center',
    border: '1px solid #e2e8f0',
    color: '#4a5568',
  },
  td: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
  },
  tableRow: {
    backgroundColor: 'white',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafc',
  },
  buttonRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
    flexWrap: 'wrap',
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

  backButton_2: {
    padding: '12px 24px',
    backgroundColor: '#FFFFFF',
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
  exportButton: {
    padding: '12px 24px',
    backgroundColor: '#38a169',
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
  commercialCard: {
    marginBottom: '32px',
    backgroundColor: 'white',
    padding: '16px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  commercialTitle: {
    color: '#2d3748',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
  },
  commercialSummary: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  notificationBox: {
    backgroundColor: '#fff3cd',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #ffeeba',
    color: '#856404',
    marginTop: '24px',
  },
  processingMsg: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#718096',
    marginTop: '4px',
  },
  loading: {
    padding: '32px',
    textAlign: 'center',
    color: '#4a5568',
  },
  error: {
    padding: '32px',
    textAlign: 'center',
    color: '#e53e3e',
  },

  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginBottom: '12px',
  },
};

export default DfPreview;