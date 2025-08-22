// ChannelRatingAllocator.jsx
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import ChannelBudgetSetup from './ChannelBudgetSetup';
import OptimizationResults from './OptimizationResults';

function ChannelRatingAllocator({ channels, dfFull, optimizationInput, onBack }) {
  const [budgetShares, setBudgetShares] = useState({});
  const [maxSpots, setMaxSpots] = useState(optimizationInput.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(optimizationInput.timeLimit || 120);
  const [primePct, setPrimePct] = useState(80);
  const [nonPrimePct, setNonPrimePct] = useState(20);
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  // Property programs table (per channel)
  const [propertyPrograms, setPropertyPrograms] = useState(() => {
    const seed = {};
    (channels || []).forEach(ch => (seed[ch] = []));
    return seed;
  });

  // Property flags & amounts
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

  // Per‑channel PT/NPT splits (default from globals)
  const [channelSplits, setChannelSplits] = useState(() => {
    const seed = {};
    (channels || []).forEach(ch => {
      seed[ch] = { prime: 80, nonprime: 20 };
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

  // ✅ FRONTEND validation: each channel’s property programs budget sum must equal its property amount
  const propertyValidation = useMemo(() => {
    const issues = [];
    (channels || []).forEach(ch => {
      if (!hasProperty[ch] || toNumber(propertyAmounts[ch]) <= 0) return;
      const sum = (propertyPrograms[ch] || []).reduce((a, r) => a + toNumber(r.budget), 0);
      const target = toNumber(propertyAmounts[ch]);
      const diff = target - sum;
      const ok = Math.abs(diff) <= 0.5; // small tolerance
      if (!ok) issues.push({ channel: ch, target, sum, diff });
    });
    return { ok: issues.length === 0, issues };
  }, [channels, hasProperty, propertyAmounts, propertyPrograms]);

      // Sum NGRP from property programs
    // Sum NGRP from property programs (derive if not provided)
    const propertyNGRPTotal = useMemo(() => {
      let sum = 0;
      (channels || []).forEach((ch) => {
        (propertyPrograms[ch] || []).forEach((r) => {
          const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
          const duration = toNum(r.duration ?? r.Duration);
          const tvr      = toNum(r.tvr ?? r.TVR);
          const spots    = parseInt(r.spots ?? r.Spots ?? 0, 10) || 0;

          // derive NTVR if missing: TVR/30 * Duration
          const ntvr = (r.ntvr ?? r.NTVR) != null
            ? toNum(r.ntvr ?? r.NTVR)
            : (tvr / 30) * duration;

          // derive NGRP if missing: NTVR * Spots
          const ngrp = (r.ngrp ?? r.NGRP) != null
            ? toNum(r.ngrp ?? r.NGRP)
            : ntvr * spots;

          sum += ngrp;
        });
      });
      return sum;
    }, [channels, propertyPrograms]);


    // Inclusive totals (optimization result + property add-ons)
    const inclusiveTotals = useMemo(() => {
      if (!result) return {};
      const totalBudgetIncl = toNumber(result.total_cost) + toNumber(totalProperty);
      const totalNGRPIncl = toNumber(result.total_rating) + toNumber(propertyNGRPTotal);
      const cprpIncl = totalNGRPIncl > 0 ? totalBudgetIncl / totalNGRPIncl : 0;
      return { totalBudgetIncl, totalNGRPIncl, cprpIncl };
    }, [result, totalProperty, propertyNGRPTotal, toNumber]);


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

  const handleBudgetProportionChange = (index, value) => {
    const updated = [...budgetProportions];
    updated[index] = value;
    setBudgetProportions(updated);
  };

  const toggleProperty = ch => setHasProperty(prev => ({ ...prev, [ch]: !prev[ch] }));
  const handlePropertyAmount = (ch, value) =>
    setPropertyAmounts(prev => ({ ...prev, [ch]: toNumber(value) }));

  // Table/summary orders used by Results
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
    // 3) Multi‑commercial split check
    if (optimizationInput.numCommercials > 1) {
      const totalCommPct = budgetProportions.reduce((a, b) => a + toNumber(b), 0);
      if (Math.abs(totalCommPct - 100) > 0.01) {
        alert('Total commercial budget % must equal 100%');
        return;
      }
    }
    // 4) Time limit guardrails
    const time = parseInt(timeLimit);
    if (time < 60) { alert('⏱ Optimization time limit must be at least 60 seconds.'); return; }
    if (time > 599) {
      const confirmProceed = window.confirm('⚠️ Time limit is over 10 minutes. The server will continue optimizing even if you stop. Proceed?');
      if (!confirmProceed) return;
    }
    // 5) ✅ Property‑programs total must match property per channel
    if (!propertyValidation.ok) {
      const msg = propertyValidation.issues.map(
        it => `${it.channel}: target ${formatLKR(it.target)} vs entered ${formatLKR(it.sum)} (diff ${formatLKR(it.diff)})`
      ).join('\n');
      alert(`Fix property programs total before optimizing:\n${msg}`);
      return;
    }

    // 6) Build per‑channel PT/NPT maps
    const channel_prime_pct_map = {};
    const channel_nonprime_pct_map = {};
    channels.forEach(ch => {
      channel_prime_pct_map[ch] = toNumber(channelSplits[ch]?.prime ?? primePct);
      channel_nonprime_pct_map[ch] = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
    });

    // 7) Adjusted shares based on AVAILABLE totals
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
      budget: Number(totalAvailable.toFixed(2)),
      budget_bound: optimizationInput.budgetBound,
      budget_shares: adjustedShares,
      df_full: dfFull,
      num_commercials: optimizationInput.numCommercials,
      min_spots: optimizationInput.minSpots,
      max_spots: maxSpots,
      time_limit: timeLimit,
      prime_pct: primePct,
      nonprime_pct: nonPrimePct,
      channel_prime_pct_map,
      channel_nonprime_pct_map,
      budget_proportions: budgetProportions.map(p => parseFloat(p))
    };

    setIsProcessing(true);
    setStopRequested(false);

    fetch('https://optwebapp-production.up.railway.app/optimize-by-budget-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        let data;
        try { data = await res.json(); }
        catch { throw new Error('Server returned invalid JSON.'); }
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
          data.channel_summary = data.channel_summary.map(row => {
            const sortedRow = {};
            summaryOrder.forEach(key => (sortedRow[key] = row[key]));
            return sortedRow;
          });
        }

        if (data?.success === false) {
          setResult(null);
          window.alert((data.message || 'No feasible solution found.') +
                       (data.solver_status ? `\nSolver status: ${data.solver_status}` : ''));
          return;
        }
        if (data?.success !== true) {
          setResult(null);
          window.alert('Optimization did not return a successful result.');
          return;
        }

        const hasDisplayablePlan = Array.isArray(data.df_result) && data.df_result.length > 0;
        const solverStatus = data?.solver_status || 'Unknown';
        const isOptimal = Boolean(data?.is_optimal === true);
        const notProvenOptimal = Boolean(data?.feasible_but_not_optimal === true) || solverStatus === 'Not Solved';

        if (hasDisplayablePlan) {
          setResult(data);
          if (isOptimal) toast.success('🎯 Optimal solution found. Proceed to download.');
          else if (notProvenOptimal) toast.info('Feasible plan found within the time limit (not proven optimal). If possible, increase the time limit and re‑optimize.');
          else toast.info('Feasible plan returned.');

          setTimeout(() => {
            document.getElementById('optimization-summary')?.scrollIntoView({ behavior: 'smooth' });
          }, 300);
        } else {
          setResult(null);
          window.alert(`Result ambiguous (no rows to display).\nSolver status: ${solverStatus}`);
        }
      })
      .catch((err) => {
        if (stopRequested) return;
        const base = err?.message || 'Optimization failed. Try adjusting your inputs.';
        const withStatus = err?.solver_status ? `${base}\nSolver status: ${err.solver_status}` : base;
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


  const totalsWithProperty = useMemo(() => {
    const optCost = toNumber(result?.total_cost);
    const optRating = toNumber(result?.total_rating);
    const totalBudgetInclProperty = optCost + totalProperty;
    const totalRatingInclProperty = optRating + propertyNGRPTotal;
    const cprpInclProperty =
      totalRatingInclProperty > 0 ? totalBudgetInclProperty / totalRatingInclProperty : 0;
    return {
      budget: totalBudgetInclProperty,
      rating: totalRatingInclProperty,
      cprp: cprpInclProperty,
    };
  }, [result, totalProperty, propertyNGRPTotal]);

  // shared styles (passed to children)
  const styles = {
    container: { padding: '32px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '24px' },
    channelInputs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', marginBottom: '24px' },
    inputGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },
    numberInput: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', width: '100px', fontSize: '14px' },
    checkbox: { width: 16, height: 16, accentColor: '#4299e1', cursor: 'pointer' },
    percentSymbol: { color: '#4a5568', fontSize: '14px' },
    runningTotalsBox: { marginTop: 8, marginBottom: 16, padding: '10px 12px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, color: '#2d3748' },
    smallSyncBtn: { marginLeft: 10, padding: '4px 8px', fontSize: 12, border: '1px solid #cbd5e0', background: '#edf2f7', borderRadius: 6, cursor: 'pointer' },
    maxSpotsContainer: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
    buttonRow: { display: 'flex', gap: '16px', marginBottom: '32px' },
    backButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
    primaryButton: { padding: '12px 24px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer' },
    resultContainer: { marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e2e8f0' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '24px' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
    summaryCard: { backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    exportButton: { padding: '12px 24px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', marginTop: '24px' },
    processingMsg: { fontSize: '16px', fontWeight: '500', color: '#718096', marginTop: '4px' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' },
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    stopButton: { padding: '12px 20px', backgroundColor: '#e53e3e', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
    backHomeButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px' }
  };

  return (
    <div style={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <h2 style={styles.title}>Allocate Desired Budget Percentage per Channel</h2>

      <ChannelBudgetSetup
        channels={channels}
        optimizationInput={optimizationInput}
        // state
        budgetShares={budgetShares}
        setBudgetShares={setBudgetShares}
        maxSpots={maxSpots}
        setMaxSpots={setMaxSpots}
        timeLimit={timeLimit}
        setTimeLimit={setTimeLimit}
        primePct={primePct}
        setPrimePct={setPrimePct}
        nonPrimePct={nonPrimePct}
        setNonPrimePct={setNonPrimePct}
        hasProperty={hasProperty}
        toggleProperty={toggleProperty}
        propertyAmounts={propertyAmounts}
        handlePropertyAmount={handlePropertyAmount}
        channelSplits={channelSplits}
        handleChannelSplitChange={handleChannelSplitChange}
        budgetProportions={budgetProportions}
        handleBudgetProportionChange={handleBudgetProportionChange}
        perChannelSplitErrors={perChannelSplitErrors}
        propertyPrograms={propertyPrograms}
        setPropertyPrograms={setPropertyPrograms}
        propertyValidation={propertyValidation}
        // derived
        totalBudget={totalBudget}
        enteredPctTotal={enteredPctTotal}
        totalProperty={totalProperty}
        totalAvailable={totalAvailable}
        channelMoney={channelMoney}
        // helpers
        toNumber={toNumber}
        formatLKR={formatLKR}
        applyGlobalToAllChannels={applyGlobalToAllChannels}
        // actions
        onBack={onBack}
        onSubmit={handleSubmit}
        onStop={handleStop}
        isProcessing={isProcessing}
        styles={styles}
      />

      {result && (
        <OptimizationResults
          result={result}
          displayOrder={displayOrder}
          summaryOrder={summaryOrder}
          formatLKR={formatLKR}
          styles={styles}
          onExport={handleExportToExcel}
          // NEW: show totals including property
          //totalsWithProperty={totalsWithProperty}
          // (optional for debugging/visibility in Results)
          //totalProperty={totalProperty}
          //propertyNGRPTotal={propertyNGRPTotal}
          inclusiveTotals={inclusiveTotals}
        />
      )}
    </div>
  );
}

export default ChannelRatingAllocator;
