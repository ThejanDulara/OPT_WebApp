// ChannelRatingAllocator.jsx
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import ChannelBudgetSetup from './ChannelBudgetSetup';

function ChannelRatingAllocator({
  channels,
  dfFull,
  optimizationInput,
  onBack,
  onProceedToBonus,
  onChannelMoney,
  onResultReady
}) {
  const [budgetShares, setBudgetShares] = useState({});
  const [maxSpots, setMaxSpots] = useState(optimizationInput.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(optimizationInput.timeLimit || 120);
  const [primePct, setPrimePct] = useState(80);
  const [nonPrimePct, setNonPrimePct] = useState(20);
  const [result, setResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [propertyPercents, setPropertyPercents] = useState({});

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

  // Per-channel PT/NPT splits (default from globals)
  const [channelSplits, setChannelSplits] = useState(() => {
    const seed = {};
    (channels || []).forEach(ch => {
      seed[ch] = { prime: 80, nonprime: 20 };
    });
    return seed;
  });

  const toNumber = useCallback((v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }, []);

  const totalBudget = toNumber(optimizationInput.budget);
  const formatLKR = n =>
    `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  const enteredPctTotal = Object.values(budgetShares).reduce(
    (a, b) => a + toNumber(b),
    0
  );

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
      Array(optimizationInput.numCommercials).fill(
        (100 / optimizationInput.numCommercials).toFixed(2)
      )
  );

  // channelMoney now supports onCost + comBenefit
    const channelMoney = useMemo(() => {
      const map = {};
      (channels || []).forEach(ch => {
        const pct = toNumber(budgetShares[ch]);
        const chAmount = (totalBudget * pct) / 100;
        const propTotal = hasProperty[ch] ? Math.max(0, toNumber(propertyAmounts[ch])) : 0;

        const { onCostPct, comBenefitPct } = propertyPercents[ch] || { onCostPct: 20, comBenefitPct: 80 };
        const onCost = (propTotal * onCostPct) / 100;
        const comBenefit = (propTotal * comBenefitPct) / 100;

        const available = Math.max(0, chAmount - propTotal);
        map[ch] = { pct, chAmount, prop: propTotal, onCost, comBenefit, available };
      });
      return map;
    }, [channels, budgetShares, totalBudget, hasProperty, propertyAmounts, propertyPercents]);


  // Pass up channelMoney
  useEffect(() => {
    if (typeof onChannelMoney === 'function') onChannelMoney(channelMoney);
  }, [channelMoney, onChannelMoney]);

  const totalProperty = useMemo(
    () => Object.values(channelMoney).reduce((a, v) => a + toNumber(v.prop), 0),
    [channelMoney]
  );

  const totalAvailable = useMemo(
    () =>
      Object.values(channelMoney).reduce((a, v) => a + toNumber(v.available), 0),
    [channelMoney]
  );

  // ✅ Validation: property programs total must match On cost
  const propertyValidation = useMemo(() => {
    const issues = [];
    (channels || []).forEach(ch => {
      if (!hasProperty[ch] || toNumber(propertyAmounts[ch]) <= 0) return;
      const sum = (propertyPrograms[ch] || []).reduce(
        (a, r) => a + toNumber(r.budget),
        0
      );
      // use On cost (already calculated in channelMoney)
      const target = toNumber(channelMoney[ch]?.onCost || 0);
      const diff = target - sum;
      const ok = Math.abs(diff) <= 0.5;

      if (!ok) {issues.push({ channel: ch, target, sum, diff });
      }
    });
    return { ok: issues.length === 0, issues };
  }, [channels, hasProperty, propertyAmounts, propertyPrograms, channelMoney, toNumber]);

  // Sum NGRP from property programs
  const propertyNGRPTotal = useMemo(() => {
    let sum = 0;
    (channels || []).forEach(ch => {
      (propertyPrograms[ch] || []).forEach(r => {
        const toNum = v => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
        const duration = toNum(r.duration ?? r.Duration);
        const tvr = toNum(r.tvr ?? r.TVR);
        const spots = parseInt(r.spots ?? r.Spots ?? 0, 10) || 0;

        const ntvr =
          (r.ntvr ?? r.NTVR) != null ? toNum(r.ntvr ?? r.NTVR) : (tvr / 30) * duration;

        const ngrp =
          (r.ngrp ?? r.NGRP) != null ? toNum(r.ngrp ?? r.NGRP) : ntvr * spots;

        sum += ngrp;
      });
    });
    return sum;
  }, [channels, propertyPrograms]);

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

  const toggleProperty = ch =>
    setHasProperty(prev => ({ ...prev, [ch]: !prev[ch] }));
  const handlePropertyAmount = (ch, value) =>
    setPropertyAmounts(prev => ({ ...prev, [ch]: toNumber(value) }));

  const displayOrder = [
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
    'Total_Rating',
    'Spots'
  ];

  const summaryOrder = [
    'Channel',
    'Total_Cost',
    '% Cost',
    'Total_Rating',
    '% Rating',
    'Prime Cost',
    'Prime Cost %',
    'Non-Prime Cost',
    'Non-Prime Cost %',
    'Prime Rating',
    'Non-Prime Rating'
  ];

  const handleSubmit = () => {
    if (Math.abs(enteredPctTotal - 100) > 0.01) {
      alert('Total channel budget % must equal 100%');
      return;
    }
    if (toNumber(primePct) + toNumber(nonPrimePct) !== 100) {
      alert('Prime + Non-Prime % must equal 100%');
      return;
    }
    if (Object.keys(perChannelSplitErrors).length > 0) {
      alert("Each channel's PT% + NPT% must equal 100%.");
      return;
    }
    for (const ch of channels) {
      const { chAmount, prop } = channelMoney[ch] || { chAmount: 0, prop: 0 };
      if (prop > chAmount + 1e-6) {
        alert(
          `Property amount for ${ch} exceeds its channel budget (${formatLKR(
            chAmount
          )}).`
        );
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
    const time = parseInt(timeLimit);
    if (time < 60) {
      alert('⏱ Optimization time limit must be at least 60 seconds.');
      return;
    }
    if (time > 599) {
      const confirmProceed = window.confirm(
        '⚠️ Time limit is over 10 minutes. Proceed?'
      );
      if (!confirmProceed) return;
    }
    if (!propertyValidation.ok) {
      const msg = propertyValidation.issues
        .map(
          it =>
            `${it.channel}: target ${formatLKR(it.target)} vs entered ${formatLKR(
              it.sum
            )} (diff ${formatLKR(it.diff)})`
        )
        .join('\n');
      alert(`Fix property programs total before optimizing:\n${msg}`);
      return;
    }

    const channel_prime_pct_map = {};
    const channel_nonprime_pct_map = {};
    channels.forEach(ch => {
      channel_prime_pct_map[ch] = toNumber(channelSplits[ch]?.prime ?? primePct);
      channel_nonprime_pct_map[ch] = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
    });

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
      body: JSON.stringify(payload)
    })
      .then(async res => {
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error('Server returned invalid JSON.');
        }
        if (!res.ok) {
          const err = new Error(data?.message || `Server error (${res.status})`);
          err.solver_status = data?.solver_status;
          throw err;
        }
        return data;
      })
      .then(data => {
        if (stopRequested) return;

        if (data?.success === false) {
          setResult(null);
          window.alert(data.message || 'No feasible solution found.');
          return;
        }
        if (data?.success !== true) {
          setResult(null);
          window.alert('Optimization did not return a successful result.');
          return;
        }

        setResult(data);

        const inclusiveTotals = {
          totalBudgetIncl: toNumber(data.total_cost) + toNumber(totalProperty),
          totalNGRPIncl: toNumber(data.total_rating) + toNumber(propertyNGRPTotal),
          cprpIncl:
            toNumber(data.total_rating) + toNumber(propertyNGRPTotal) > 0
              ? (toNumber(data.total_cost) + toNumber(totalProperty)) /
                (toNumber(data.total_rating) + toNumber(propertyNGRPTotal))
              : 0
        };

        const adaptedForFinal = {
          tables: {
            by_program: Array.isArray(data.df_result) ? data.df_result : [],
            by_channel: Array.isArray(data.channel_summary) ? data.channel_summary : []
          },
          commercials_summary: Array.isArray(data.commercials_summary)
            ? data.commercials_summary
            : [],
          totals: {
            total_budget_incl_property: data.total_cost,
            total_cost_incl_property: data.total_cost,
            total_rating: data.total_rating
          },
          inclusiveTotals
        };

        onResultReady?.({
          raw: data,
          final: adaptedForFinal,
          inclusiveTotals,
          propertyPrograms
        });

        // 🔔 Detailed notifications (time limit / optimality aware)
        const isOptimal = data?.is_optimal === true;
        const hitTimeLimit = data?.hit_time_limit === true;
        const notProvenOptimal =
          data?.feasible_but_not_optimal === true ||
          data?.solver_status === 'Not Solved' ||
          hitTimeLimit;

        if (isOptimal && !notProvenOptimal) {
          toast.success('Optimal solution found. Proceed to download.');
        } else if (notProvenOptimal) {
          toast.info(
            'Feasible plan found within the time limit (not proven optimal). If possible, increase the time limit and re-optimize.',
            { autoClose: 10000 }
          );
        } else {
          toast.info('Feasible plan returned.');
        }
      })
      .catch(err => {
        if (stopRequested) return;
        window.alert(err?.message || 'Optimization failed.');
        setResult(null);
      })
      .finally(() => setIsProcessing(false));
  };

  const handleStop = () => {
    setStopRequested(true);
    setIsProcessing(false);
    alert('⛔ Optimization process manually stopped.');
  };

  const styles = {
    container: {
      padding: '32px',
      maxWidth: '1200px',
      margin: '0 auto',
      backgroundColor: '#d5e9f7',
      borderRadius: '12px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)'
    },
    title: {
      color: '#2d3748',
      fontSize: '24px',
      fontWeight: '600',
      marginBottom: '24px'
    },
    channelInputs: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: '16px',
      marginBottom: '24px'
    },
    inputGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },
    numberInput: {
      padding: '8px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      width: '100px',
      fontSize: '14px'
    },
    checkbox: {
      width: 16,
      height: 16,
      accentColor: '#4299e1',
      cursor: 'pointer'
    },
    percentSymbol: { color: '#4a5568', fontSize: '14px' },
    runningTotalsBox: {
      marginTop: 8,
      marginBottom: 16,
      padding: '10px 12px',
      background: '#f7fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      fontSize: 14,
      color: '#2d3748'
    },
    smallSyncBtn: {
      marginLeft: 10,
      padding: '4px 8px',
      fontSize: 12,
      border: '1px solid #cbd5e0',
      background: '#edf2f7',
      borderRadius: 6,
      cursor: 'pointer'
    },
    maxSpotsContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '16px'
    },
    buttonRow: { display: 'flex', gap: '16px', marginBottom: '32px' },
    backButton: {
      padding: '12px 24px',
      backgroundColor: '#edf2f7',
      color: '#2d3748',
      border: '1px solid #cbd5e0',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer'
    },
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
    resultContainer: {
      marginTop: '32px',
      paddingTop: '32px',
      borderTop: '1px solid #e2e8f0'
    },
    sectionTitle: {
      color: '#2d3748',
      fontSize: '20px',
      fontWeight: '600',
      marginBottom: '24px'
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px'
    },
    summaryCard: {
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '16px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
      marginBottom: '24px'
    },
    summaryTitle: {
      color: '#4a5568',
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '8px'
    },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
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
      marginRight: '20px'
    },
    processingMsg: {
      fontSize: '16px',
      fontWeight: '500',
      color: '#718096',
      marginTop: '4px'
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
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    stopButton: {
      padding: '12px 20px',
      backgroundColor: '#e53e3e',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
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
      cursor: 'pointer',
      marginTop: '16px',
      marginRight: '20px'
    }
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
        propertyPercents={propertyPercents}
        setPropertyPercents={setPropertyPercents}
        styles={styles}
      />
    </div>
  );
}

export default ChannelRatingAllocator;
