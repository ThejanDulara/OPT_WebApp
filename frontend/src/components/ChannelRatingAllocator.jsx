import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function ChannelRatingAllocator({ channels, dfFull, optimizationInput, onBack }) {
  const [budgetShares, setBudgetShares] = useState({});
  const [maxSpots, setMaxSpots] = useState(optimizationInput.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(optimizationInput.timeLimit || 120);
  const [primePct, setPrimePct] = useState(80);    // global default
  const [nonPrimePct, setNonPrimePct] = useState(20); // global default
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  // NEW: property flags & amounts
  const [hasProperty, setHasProperty] = useState(() => {
    const o = {};
    (channels || []).forEach(ch => (o[ch] = false));
    return o;
  });
  const [propertyAmounts, setPropertyAmounts] = useState(() => {
    const o = {};
    (channels || []).forEach(ch => (o[ch] = 0));
    return o;
  });

  // Per-channel PT/NPT splits (default from globals)
  const [channelSplits, setChannelSplits] = useState(() => {
    const seed = {};
    (channels || []).forEach(ch => {
      seed[ch] = { prime: primePct, nonprime: nonPrimePct };
    });
    return seed;
  });

  const toNumber = v => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const totalBudget = toNumber(optimizationInput.budget);
  const formatLKR = n => `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  const enteredPctTotal = Object.values(budgetShares).reduce((a, b) => a + toNumber(b), 0);

  const perChannelSplitErrors = useMemo(() => {
    const errs = {};
    (channels || []).forEach(ch => {
      const p = toNumber(channelSplits[ch]?.prime ?? primePct);
      const np = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
      if (Math.abs(p + np - 100) > 0.01) errs[ch] = true;
    });
    return errs;
  }, [channels, channelSplits, primePct, nonPrimePct]);

  const [budgetProportions, setBudgetProportions] = useState(
    optimizationInput.budgetProportions ||
      Array(optimizationInput.numCommercials).fill((100 / optimizationInput.numCommercials).toFixed(2))
  );

  // Derived: channel amount, property amount, available amount
  const channelMoney = useMemo(() => {
    const map = {};
    (channels || []).forEach(ch => {
      const pct = toNumber(budgetShares[ch]);
      const chAmount = (totalBudget * pct) / 100;
      const prop = hasProperty[ch] ? Math.max(0, toNumber(propertyAmounts[ch])) : 0;
      const available = Math.max(0, chAmount - prop);
      map[ch] = { pct, chAmount, prop, available };
    });
    return map;
  }, [channels, budgetShares, totalBudget, hasProperty, propertyAmounts]);

  const totalProperty = useMemo(
    () => Object.values(channelMoney).reduce((a, v) => a + toNumber(v.prop), 0),
    [channelMoney]
  );
  const totalAvailable = useMemo(
    () => Object.values(channelMoney).reduce((a, v) => a + toNumber(v.available), 0),
    [channelMoney]
  );

  const applyGlobalToAllChannels = () => {
    const next = {};
    channels.forEach(ch => {
      next[ch] = { prime: toNumber(primePct), nonprime: toNumber(nonPrimePct) };
    });
    setChannelSplits(next);
    toast.info('Applied global PT/NPT split to all channels');
  };

  const handleChannelSplitChange = (ch, which, value) => {
    setChannelSplits(prev => {
      const prime = which === 'prime' ? value : prev[ch]?.prime ?? primePct;
      const nonprime = which === 'nonprime' ? value : prev[ch]?.nonprime ?? nonPrimePct;
      return { ...prev, [ch]: { prime: toNumber(prime), nonprime: toNumber(nonprime) } };
    });
  };

  const handleInputChange = (channel, value) => {
    setBudgetShares(prev => ({ ...prev, [channel]: toNumber(value) }));
  };

  const handleBudgetProportionChange = (index, value) => {
    const updated = [...budgetProportions];
    updated[index] = value;
    setBudgetProportions(updated);
  };

  const toggleProperty = (ch) => {
    setHasProperty(prev => ({ ...prev, [ch]: !prev[ch] }));
  };

  const handlePropertyAmount = (ch, value) => {
    setPropertyAmounts(prev => ({ ...prev, [ch]: toNumber(value) }));
  };

  // Table/summary orders
  const displayOrder = [
    'Channel','Program','Day','Time','Slot','Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating','Spots'
  ];
  const summaryOrder = [
    'Channel','Total_Cost','% Cost','Total_Rating','% Rating',
    'Prime Cost','Prime Cost %','Non-Prime Cost','Non-Prime Cost %','Prime Rating','Non-Prime Rating',
  ];

  const handleSubmit = () => {
    // 1) Basic validations
    if (Math.abs(enteredPctTotal - 100) > 0.01) {
      alert('Total channel budget % must equal 100%');
      return;
    }

    if (toNumber(primePct) + toNumber(nonPrimePct) !== 100) {
      alert('Prime + Non-Prime % must equal 100%');
      return;
    }

    const hasPerChannelError = Object.keys(perChannelSplitErrors).length > 0;
    if (hasPerChannelError) {
      alert("Each channel's PT% + NPT% must equal 100%. Please fix highlighted channels.");
      return;
    }

    // 2) Property validations (cannot exceed channel money)
    for (const ch of channels) {
      const { chAmount, prop } = channelMoney[ch] || { chAmount: 0, prop: 0 };
      if (prop > chAmount + 1e-6) {
        alert(`Property amount for ${ch} exceeds its channel budget (${formatLKR(chAmount)}).`);
        return;
      }
    }

    if (optimizationInput.numCommercials > 1) {
      const totalCommPct = budgetProportions.reduce((a, b) => a + toNumber(b), 0);
      if (Math.abs(totalCommPct - 100) > 0.01) {
        alert('Total commercial budget % must equal 100%');
        return;
      }
    }

    // 3) Time limit guardrails
    const time = parseInt(timeLimit);
    if (time < 60) {
      alert('⏱ Optimization time limit must be at least 60 seconds.');
      return;
    }
    if (time > 599) {
      const confirmProceed = window.confirm('⚠️ Time limit is over 10 minutes. The server will continue optimizing even if you stop. Proceed?');
      if (!confirmProceed) return;
    }

    // 4) Build per-channel PT/NPT maps
    const channel_prime_pct_map = {};
    const channel_nonprime_pct_map = {};
    channels.forEach(ch => {
      channel_prime_pct_map[ch] = toNumber(channelSplits[ch]?.prime ?? primePct);
      channel_nonprime_pct_map[ch] = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
    });

    // 5) Build adjusted budget shares based on AVAILABLE totals
    //    and set budget to totalAvailable (so optimizer spends only the non-property money).
    const adjustedShares = {};
    if (totalAvailable <= 0) {
      alert('All budget is consumed by property amounts. Nothing left to optimize.');
      return;
    }
    channels.forEach(ch => {
      const available = toNumber(channelMoney[ch]?.available);
      adjustedShares[ch] = (available / totalAvailable) * 100.0;
    });

    const payload = {
      // Replace budget with optimizable total
      budget: Number(totalAvailable.toFixed(2)),
      budget_bound: optimizationInput.budgetBound,
      // Use shares on the AVAILABLE total so they sum to 100
      budget_shares: adjustedShares,
      // Original table
      df_full: dfFull,
      // Other knobs
      num_commercials: optimizationInput.numCommercials,
      min_spots: optimizationInput.minSpots,
      max_spots: maxSpots,
      time_limit: timeLimit,
      // Keep global keys for fallback
      prime_pct: primePct,
      nonprime_pct: nonPrimePct,
      // Per-channel PT/NPT overrides
      channel_prime_pct_map,
      channel_nonprime_pct_map,
      // If multi-comm split is used
      budget_proportions: budgetProportions.map(p => parseFloat(p))
    };

    setIsProcessing(true);
    setStopRequested(false);

    fetch('https://optwebapp-production.up.railway.app/optimize-by-budget-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      // Parse JSON and surface non-2xx as errors (so .then only handles OK responses)
      .then(async (res) => {
        let data;
        try {
          data = await res.json();
        } catch (e) {
          const err = new Error('Server returned invalid JSON.');
          err.code = 'INVALID_JSON';
          throw err;
        }
        if (!res.ok) {
          const err = new Error(data?.message || `Server error (${res.status})`);
          err.solver_status = data?.solver_status;
          err.data = data;
          throw err;
        }
        return data;
      })
      .then((data) => {
        if (stopRequested) return;

        // Sort channel_summary columns if present
        if (Array.isArray(data.channel_summary)) {
          data.channel_summary = data.channel_summary.map((row) => {
            const sortedRow = {};
            summaryOrder.forEach((key) => (sortedRow[key] = row[key]));
            return sortedRow;
          });
        }

        // 1) Hard failures explicitly signaled by backend
        if (data?.success === false) {
          setResult(null);
          window.alert(
            (data.message || 'No feasible solution found.') +
              (data.solver_status ? `\nSolver status: ${data.solver_status}` : '')
          );
          return;
        }

        // 2) Must be explicitly successful
        if (data?.success !== true) {
          setResult(null);
          window.alert('Optimization did not return a successful result.');
          return;
        }

        // 3) Determine what we can show + how to message it
        const hasDisplayablePlan =
          Array.isArray(data.df_result) && data.df_result.length > 0;

        const solverStatus = data?.solver_status || 'Unknown';
        const isOptimal = Boolean(data?.is_optimal === true);
        const notProvenOptimal =
          Boolean(data?.feasible_but_not_optimal === true) ||
          solverStatus === 'Not Solved'; // time-limit case from CBC

        // Keep result for tables / export either way if success + plan exists
        if (hasDisplayablePlan) {
          setResult(data);

          if (isOptimal) {
            toast.success('🎯 Optimal solution found. Proceed to download.');
          } else if (notProvenOptimal) {
            toast.info(
              'Feasible plan found within the time limit (not proven optimal). If possible, increase the time limit and re‑optimize.'
            );
          } else {
            // Successful but backend didn’t flag optimality; still show plan
            toast.info('Feasible plan returned.');
          }

          setTimeout(() => {
            document
              .getElementById('optimization-summary')
              ?.scrollIntoView({ behavior: 'smooth' });
          }, 300);
        } else {
          // Declared success but nothing useful to show (edge case)
          setResult(null);
          window.alert(
            `Result ambiguous (no rows to display).\nSolver status: ${solverStatus}`
          );
        }
      })
      .catch((err) => {
        if (stopRequested) return; // user manually stopped; don’t nag
        const base =
          err?.message ||
          'Optimization failed. Try adjusting your inputs.';
        const withStatus = err?.solver_status
          ? `${base}\nSolver status: ${err.solver_status}`
          : base;
        window.alert(withStatus);
        setResult(null);
      })
      .finally(() => setIsProcessing(false));
  };


  const handleStop = () => {
    setStopRequested(true);
    setIsProcessing(false);
    alert('⛔ Optimization process manually stopped.');
  };

  const handleExportToExcel = () => {
    if (!result || !result.df_result || result.df_result.length === 0) {
      alert('No data to export.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const desiredOrder = [
      'Channel','Program','Day','Time','Slot','Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating','Spots'
    ];

    // One sheet per commercial
    (result.commercials_summary || []).forEach((c, idx) => {
      const headerMap = { 'Total_Cost': 'Total Budget', 'Total_Rating': 'NGRP' };
      const cleanedData = (c.details || []).map(row => {
        const newRow = {};
        desiredOrder.forEach(key => (newRow[headerMap[key] || key] = row[key]));
        return newRow;
      });
      const ws = XLSX.utils.json_to_sheet(cleanedData);
      XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
    });

    // Summary sheet
    const summaryOrder_ex = [
      'Channel','Total_Cost','% Cost','Total_Rating','% Rating',
      'Prime Cost','Prime Cost %','Non-Prime Cost','Non-Prime Cost %','Prime Rating','Non-Prime Rating',
    ];
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
      'Non-Prime Cost %': 'NPT Budget %',
    };

    if (result.channel_summary && result.channel_summary.length > 0) {
      const cleanedSummary = result.channel_summary.map(row => {
        const newRow = {};
        summaryOrder_ex.forEach(key => (newRow[summaryHeaderMap[key] || key] = row[key]));
        return newRow;
      });
      const wsSummary = XLSX.utils.json_to_sheet(cleanedSummary);
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');
    }

    // Optional: a sheet showing property inputs & available budgets
    const propertySheet = (channels || []).map(ch => ({
      Channel: ch,
      'Channel %': toNumber(budgetShares[ch] || 0),
      'Channel Budget': channelMoney[ch]?.chAmount || 0,
      'Has Property': hasProperty[ch] ? 'Yes' : 'No',
      'Property Amount': channelMoney[ch]?.prop || 0,
      'Available Budget': channelMoney[ch]?.available || 0,
      'PT %': channelSplits[ch]?.prime ?? primePct,
      'NPT %': channelSplits[ch]?.nonprime ?? nonPrimePct
    }));
    const wsProp = XLSX.utils.json_to_sheet(propertySheet);
    XLSX.utils.book_append_sheet(workbook, wsProp, 'Property & Available');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(fileData, 'optimized_schedule.xlsx');
  };

  return (
    <div style={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <h2 style={styles.title}>Allocate Desired Budget Percentage per Channel</h2>

      {/* Running totals / guidance */}
      <div style={styles.runningTotalsBox}>
        <div><strong>Entered Channel % Total:</strong> {enteredPctTotal.toFixed(2)}%</div>
        <div><strong>Total Budget:</strong> {formatLKR(totalBudget)}</div>
        <div><strong>Property Total:</strong> {formatLKR(totalProperty)}</div>
        <div><strong>Optimizable Total (excl. Property):</strong> {formatLKR(totalAvailable)}</div>
        <div style={{ marginTop: 6 }}>
          <strong>Global PT/NPT defaults:</strong> {toNumber(primePct)}% / {toNumber(nonPrimePct)}%
          <button type="button" onClick={applyGlobalToAllChannels} style={styles.smallSyncBtn}>Apply to all channels</button>
        </div>
      </div>

      {/* Channel rows */}
      <div style={styles.channelInputs}>
        {channels.map((ch, idx) => {
          const pct = toNumber(budgetShares[ch]);
          const chAmount = channelMoney[ch]?.chAmount || 0;
          const prop = channelMoney[ch]?.prop || 0;
          const available = channelMoney[ch]?.available || 0;

          const chPrimePct = toNumber(channelSplits[ch]?.prime ?? primePct);
          const chNonPrimePct = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
          const chPrimeAmount = (available * chPrimePct) / 100;
          const chNonPrimeAmount = (available * chNonPrimePct) / 100;
          const hasErr = perChannelSplitErrors[ch];

          return (
            <div key={idx} style={{ ...styles.inputGroup, alignItems: 'stretch', flexDirection: 'column' }}>
              {/* Channel % row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label style={styles.label}>{ch}:</label>
                <input
                  type="number"
                  step="0.01"
                  value={budgetShares[ch] ?? ''}
                  onChange={e => handleInputChange(ch, e.target.value)}
                  style={styles.numberInput}
                  min="0"
                  max="100"
                />
                <span style={styles.percentSymbol}>%</span>

                {/* Property toggle + amount */}
                <label style={{ ...styles.label, marginLeft: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!hasProperty[ch]}
                    onChange={() => toggleProperty(ch)}
                    style={styles.checkbox}
                  />
                  Has Property
                </label>
                {hasProperty[ch] && (
                  <>
                    <span style={{ ...styles.label, marginLeft: 6 }}>Property (LKR):</span>
                    <input
                      type="number"
                      step="0.01"
                      value={propertyAmounts[ch] ?? 0}
                      onChange={e => handlePropertyAmount(ch, e.target.value)}
                      style={{ ...styles.numberInput, width: 140 }}
                      min="0"
                    />
                  </>
                )}
              </div>

              {/* Calculated totals */}
              <div style={{ fontSize: 12, color: '#2d3748', marginTop: 6 }}>
                <div><strong>Channel Budget:</strong> {formatLKR(chAmount)}</div>
                <div><strong>Property:</strong> {formatLKR(prop)} &nbsp;|&nbsp; <strong>Available:</strong> {formatLKR(available)}</div>
                <div style={{ color: '#4a5568' }}>
                  PT on available: {formatLKR(chPrimeAmount)} &nbsp;|&nbsp; NPT: {formatLKR(chNonPrimeAmount)}
                </div>
              </div>

              {/* Per-channel PT/NPT editors */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...styles.label, minWidth: 80 }}>PT % / NPT %:</span>
                <input
                  type="number"
                  step="0.01"
                  value={channelSplits[ch]?.prime ?? primePct}
                  onChange={e => handleChannelSplitChange(ch, 'prime', e.target.value)}
                  style={{ ...styles.numberInput, borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                />
                <span style={styles.percentSymbol}>/</span>
                <input
                  type="number"
                  step="0.01"
                  value={channelSplits[ch]?.nonprime ?? nonPrimePct}
                  onChange={e => handleChannelSplitChange(ch, 'nonprime', e.target.value)}
                  style={{ ...styles.numberInput, borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                />
                <span style={styles.percentSymbol}>%</span>
                {hasErr && <span style={{ color: '#e53e3e', fontSize: 12 }}>Must total 100%</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Global PT/NPT inputs */}
      <div style={styles.channelInputs}>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Prime Time % (global default):</label>
          <input
            type="number"
            step="0.01"
            value={primePct}
            onChange={e => setPrimePct(parseFloat(e.target.value))}
            style={styles.numberInput}
          />
        </div>
        <div style={styles.inputGroup}>
          <label style={styles.label}>Non-Prime Time % (global default):</label>
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
          <p style={{ marginTop: 4, color: '#4a5568', fontSize: 14 }}>
            💡 Total must be 100% — Current: {budgetProportions.reduce((a, b) => a + toNumber(b), 0).toFixed(2)}%
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
        {!isProcessing ? (
          <>
            <button onClick={onBack} style={styles.backButton}>← Back</button>
            <button onClick={handleSubmit} style={styles.primaryButton}>Re-Optimize by Budget Share →</button>
          </>
        ) : (
          <>
            <p style={styles.processingMsg}>🕒 Optimization is processing. Please wait...</p>
            <button onClick={handleStop} style={styles.stopButton}>⛔ Stop Optimization</button>
          </>
        )}
      </div>

      {result && (
        <div id="optimization-summary">
          <div style={styles.resultContainer}>
            <h3 style={styles.sectionTitle}>Final Optimization Result</h3>

            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <h4 style={styles.summaryTitle}>Optimized Budget (excl. Property)</h4>
                <p style={styles.summaryValue}>{formatLKR(result.total_cost)}</p>
              </div>
              <div style={styles.summaryCard}>
                <h4 style={styles.summaryTitle}>NGRP</h4>
                <p style={styles.summaryValue}>{Number(result.total_rating).toFixed(2)}</p>
              </div>
              <div style={styles.summaryCard}>
                <h4 style={styles.summaryTitle}>CPRP</h4>
                <p style={styles.summaryValue}>{Number(result.cprp).toFixed(2)}</p>
              </div>
            </div>

            <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
            {(result.commercials_summary || []).map((c, idx) => (
              <div key={idx} style={styles.summaryCard}>
                <h4 style={styles.label}>Commercial {c.commercial_index + 1}</h4>
                <p>Total Budget: {formatLKR(c.total_cost)}</p>
                <p>NGRP: {Number(c.total_rating).toFixed(2)}</p>
                <p>CPRP: {Number(c.cprp).toFixed(2)}</p>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {displayOrder.map((key, i) => {
                        const headerMap = { 'Total_Rating': 'NGRP', 'Total_Cost': 'Total Budget' };
                        return <th key={i} style={styles.th}>{headerMap[key] || key}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(c.details || []).map((row, i) => (
                      <tr key={i}>
                        {displayOrder.map((key, j) => {
                          const numericCols = ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'];
                          const isNumeric = numericCols.includes(key);
                          const isCount = key === 'Spots';
                          return (
                            <td
                              key={j}
                              style={{
                                ...styles.td,
                                textAlign: ['Spots','Slot'].includes(key) ? 'center' : isNumeric ? 'right' : 'left'
                              }}
                            >
                              {isCount ? parseInt(row[key]) : isNumeric ? Number(row[key]).toFixed(2) : row[key]}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <h3 style={styles.sectionTitle}>Channel Summary with Slot Breakdown</h3>
            <table style={styles.summaryCard}>
              <thead>
                <tr>
                  {summaryOrder.map((key, i) => {
                    const headerMap = {
                      'Total_Cost': 'Total Budget','% Cost': 'Budget %','Total_Rating': 'NGRP','% Rating': 'NGRP %',
                      'Prime Cost': 'PT Budget','Non-Prime Cost': 'NPT Budget','Prime Rating': 'PT NGRP','Non-Prime Rating': 'NPT NGRP',
                      'Prime Cost %': 'PT Budget %','Non-Prime Cost %': 'NPT Budget %',
                    };
                    return <th key={i} style={styles.th}>{headerMap[key] || key}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {(result.channel_summary || []).map((row, i) => (
                  <tr key={i}>
                    {summaryOrder.map((key, j) => {
                      const isNumeric = typeof row[key] === 'number';
                      return (
                        <td key={j} style={{ ...styles.td, textAlign: isNumeric ? 'right' : 'left' }}>
                          {isNumeric ? Number(row[key]).toFixed(2) : row[key]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <button onClick={handleExportToExcel} style={styles.exportButton}>📥 Export Final Plan to Excel</button>
            <button onClick={() => window.location.href = '/'} style={styles.backHomeButton}>⬅️ Go Back to Home</button>
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
  title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '24px' },
  channelInputs: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  inputGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },
  numberInput: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    width: '100px',
    fontSize: '14px',
  },
  checkbox: { width: 16, height: 16, accentColor: '#4299e1', cursor: 'pointer' },
  percentSymbol: { color: '#4a5568', fontSize: '14px' },
  runningTotalsBox: {
    marginTop: 8, marginBottom: 16, padding: '10px 12px',
    background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 14, color: '#2d3748'
  },
  smallSyncBtn: {
    marginLeft: 10, padding: '4px 8px', fontSize: 12,
    border: '1px solid #cbd5e0', background: '#edf2f7', borderRadius: 6, cursor: 'pointer'
  },
  maxSpotsContainer: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  buttonRow: { display: 'flex', gap: '16px', marginBottom: '32px' },
  backButton: {
    padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748',
    border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
  },
  primaryButton: {
    padding: '12px 24px', backgroundColor: '#4299e1', color: 'white',
    border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer',
  },
  resultContainer: { marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e2e8f0' },
  sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '24px' },
  summaryGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px',
  },
  summaryCard: {
    backgroundColor: 'white', borderRadius: '8px', padding: '16px',
    border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
  summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
  exportButton: {
    padding: '12px 24px', backgroundColor: '#38a169', color: 'white',
    border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer',
    transition: 'all 0.2s ease', marginTop: '24px',
  },
  processingMsg: { fontSize: '16px', fontWeight: '500', color: '#718096', marginTop: '4px' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' },
  th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
  td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
  stopButton: {
    padding: '12px 20px', backgroundColor: '#e53e3e', color: 'white',
    border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
  },
  backHomeButton: {
    padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748',
    border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px',
  }
};

export default ChannelRatingAllocator;
