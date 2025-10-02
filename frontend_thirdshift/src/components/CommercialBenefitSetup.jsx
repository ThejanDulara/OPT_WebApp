// components/CommercialBenefitSetup.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import CommercialBenefitResults from './CommercialBenefitResults';

export default function CommercialBenefitSetup({
  channels,
  dfFull,
  channelMoney,            // { [ch]: { chAmount, prop, onCost, comBenefit, available } }
  optimizationInput,
  onBack,
  onResultReady,
  onProceedToBonus,
  onHome,
}) {
  const [primePct, setPrimePct] = useState(80);
  const [nonPrimePct, setNonPrimePct] = useState(20);
  const [maxSpots, setMaxSpots] = useState(optimizationInput?.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(optimizationInput?.timeLimit || 120);
  const [budgetProportions, setBudgetProportions] = useState(
    optimizationInput?.budgetProportions ||
    Array(optimizationInput?.numCommercials || 1).fill(
      (100 / (optimizationInput?.numCommercials || 1)).toFixed(2)
    )
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  const [result, setResult] = useState(null);

  // Per-channel PT/NPT (default 80/20)
  const [channelSplits, setChannelSplits] = useState(() => {
    const seed = {};
    (channels || []).forEach(ch => (seed[ch] = { prime: 80, nonprime: 20 }));
    return seed;
  });

  const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const formatLKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  // Filter to channels with Commercial Benefit > 0
  const benefitChannels = useMemo(() => (
    (channels || []).filter(ch => toNum(channelMoney?.[ch]?.comBenefit) > 0)
  ), [channels, channelMoney]);

  const totalComBenefit = useMemo(() => (
    benefitChannels.reduce((a, ch) => a + toNum(channelMoney?.[ch]?.comBenefit), 0)
  ), [benefitChannels, channelMoney]);

  const perChannelSplitErrors = useMemo(() => {
    const errs = {};
    benefitChannels.forEach(ch => {
      const p = toNum(channelSplits[ch]?.prime ?? primePct);
      const np = toNum(channelSplits[ch]?.nonprime ?? nonPrimePct);
      if (Math.abs(p + np - 100) > 0.01) errs[ch] = true;
    });
    return errs;
  }, [benefitChannels, channelSplits, primePct, nonPrimePct]);

  // Small countdown indicator (same UX feel)
  const [countdown, setCountdown] = useState(null);
  const formatMMSS = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  useEffect(() => {
    let id;
    if (isProcessing) {
      setCountdown(parseInt(timeLimit, 10) || 0);
      id = setInterval(() => {
        setCountdown(prev => {
          if (prev == null) return prev;
          if (prev <= 1) { clearInterval(id); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(null);
    }
    return () => { if (id) clearInterval(id); };
  }, [isProcessing, timeLimit]);

  const applyGlobalToAllChannels = () => {
    const next = {};
    benefitChannels.forEach(ch => {
      next[ch] = { prime: toNum(primePct), nonprime: toNum(nonPrimePct) };
    });
    setChannelSplits(next);
    toast.info('Applied global PT/NPT split to all channels (Commercial Benefit)');
  };

  const handleChannelSplitChange = (ch, which, value) => {
    setChannelSplits(prev => {
      const prime = which === 'prime' ? value : prev[ch]?.prime ?? primePct;
      const nonprime = which === 'nonprime' ? value : prev[ch]?.nonprime ?? nonPrimePct;
      return { ...prev, [ch]: { prime: toNum(prime), nonprime: toNum(nonprime) } };
    });
  };

  const handleBudgetProportionChange = (i, val) => {
    const next = [...budgetProportions];
    next[i] = val;
    setBudgetProportions(next);
  };

  const styles = {
    container: { padding: '32px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: 600, marginBottom: 24 },
    channelRow: { display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' },
    card: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, minWidth: 300, flex: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' },
    headInfo: { display: 'flex', alignItems: 'center', gap: 12 },
    logo: { height: 40, width: 'auto', objectFit: 'contain', borderRadius: 4 },
    label: { color: '#4a5568', fontWeight: 500, fontSize: 14 },
    numberInput: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, width: 100, fontSize: 14, textAlign: 'right' },
    amountBox: { padding: '6px 10px', background: '#edf2f7', borderRadius: 4, fontSize: 13, marginTop: 6 },
    splitWrap: { display: 'flex', flexDirection: 'column', gap: 8, padding: 8, background: '#f1f5f9', borderRadius: 4, marginTop: 8 },
    section: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginTop: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    sectionTitle: { fontSize: 18, fontWeight: 600, color: '#2d3748', marginBottom: 16, paddingBottom: 8, borderBottom: '2px solid #e2e8f0' },
    side: { display: 'flex', gap: 20, flexWrap: 'wrap' },
    half: { flex: 1, minWidth: 400, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    buttonRow: { display: 'flex', gap: 16, marginTop: 24, marginBottom: 8 },
    backButton: { padding: '12px 24px', background: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
    primaryButton: { padding: '12px 24px', background: '#4299e1', color: '#fff', border: 'none', borderRadius: 6, fontSize: 16, fontWeight: 500, cursor: 'pointer' },
    percentSymbol: { color: '#4a5568', fontSize: 14 },
    error: { color: '#e53e3e', fontSize: 12, marginTop: 4 },
    commercialGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 40, marginBottom: 12 },
    smallInput: { padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, width: 80, fontSize: 14, textAlign: 'right' },
    processingMsg: { fontSize: 16, fontWeight: 500, color: '#718096', marginTop: 4 },
    stopButton: { padding: '12px 20px', background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  };

  const getLogoPath = (ch) => `/logos/${ch}.png`;

  const disableOptimize = isProcessing || benefitChannels.length === 0;

  const handleSubmit = () => {
    // Validations same as base (minus property checks)
    if (toNum(primePct) + toNum(nonPrimePct) !== 100) {
      alert('Prime + Non-Prime % must equal 100% (global).');
      return;
    }
    if (Object.keys(perChannelSplitErrors).length > 0) {
      alert("Each channel's PT% + NPT% must equal 100%.");
      return;
    }
    if (optimizationInput?.numCommercials > 1) {
      const totalCommPct = budgetProportions.reduce((a, b) => a + toNum(b), 0);
      if (Math.abs(totalCommPct - 100) > 0.01) {
        alert('Total commercial budget % must equal 100%');
        return;
      }
    }
    const time = parseInt(timeLimit, 10);
    if (time < 60) { alert('⏱ Optimization time limit must be at least 60 seconds.'); return; }
    if (time > 599 && !window.confirm('⚠️ Time limit is over 10 minutes. Proceed?')) return;

    if (totalComBenefit <= 0) {
      alert('No Commercial Benefit budget to optimize.');
      return;
    }

    // budget_shares based on comBenefit proportions
    const budget_shares = {};
    benefitChannels.forEach(ch => {
      const b = toNum(channelMoney?.[ch]?.comBenefit);
      budget_shares[ch] = (b / totalComBenefit) * 100.0;
    });

    const channel_prime_pct_map = {};
    const channel_nonprime_pct_map = {};
    benefitChannels.forEach(ch => {
      channel_prime_pct_map[ch] = toNum(channelSplits[ch]?.prime ?? primePct);
      channel_nonprime_pct_map[ch] = toNum(channelSplits[ch]?.nonprime ?? nonPrimePct);
    });

    const payload = {
      budget: Number(totalComBenefit.toFixed(2)),
      budget_bound: toNum(optimizationInput?.budgetBound),
      budget_shares,
      df_full: dfFull,
      num_commercials: optimizationInput?.numCommercials || 1,
      min_spots: optimizationInput?.minSpots || 0,
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

    // 🔁 Replace with your separate endpoint for CB optimization
    const BENEFIT_ENDPOINT = 'https://optwebapp-production.up.railway.app/optimize-by-benefit-share';

    fetch(BENEFIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(async (res) => {
      let data;
      try { data = await res.json(); }
      catch { throw new Error('Server returned invalid JSON.'); }
      if (!res.ok) {
        const err = new Error(data?.message || `Server error (${res.status})`);
        err.solver_status = data?.solver_status;
        throw err;
      }
      return data;
    })
    .then((data) => {
      if (stopRequested) return;

      if (data?.success !== true) {
        window.alert(data?.message || 'No feasible solution found.');
        return;
      }

      const adapted = {
        tables: {
          by_program: Array.isArray(data.df_result) ? data.df_result : [],
          by_channel: Array.isArray(data.channel_summary) ? data.channel_summary : []
        },
        commercials_summary: Array.isArray(data.commercials_summary) ? data.commercials_summary : [],
        totals: {
          total_budget_incl_property: data.total_cost,
          total_cost_incl_property: data.total_cost,
          total_rating: data.total_rating
        },
        inclusiveTotals: {
          totalBudgetIncl: toNum(data.total_cost),
          totalNGRPIncl: toNum(data.total_rating),
          cprpIncl: toNum(data.total_rating) > 0
            ? toNum(data.total_cost) / toNum(data.total_rating)
            : 0
        }
      };

      setResult(adapted); // 👈 show inline results
      onResultReady?.({ raw: data, final: adapted, inclusiveTotals: adapted.inclusiveTotals });
      toast.success('Commercial Benefit optimization complete.');
    })

    .catch(err => {
      if (stopRequested) return;
      window.alert(err?.message || 'Commercial Benefit optimization failed.');
    })
    .finally(() => setIsProcessing(false));
  };

  const handleStop = () => {
    setStopRequested(true);
    setIsProcessing(false);
    alert('⛔ Optimization process manually stopped.');
  };

  // --- UI ---
  return (
    <div style={styles.container}>
      <ToastContainer position="top-right" autoClose={3000} />
      <h2 style={styles.title}>Commercial Benefit Optimization</h2>

      {/* Channel cards (only those with CB > 0) */}
      <div style={styles.channelRow}>
        {benefitChannels.map((ch) => {
          const chAmount = toNum(channelMoney?.[ch]?.chAmount);
          const comBenefit = toNum(channelMoney?.[ch]?.comBenefit);
          const chPrimePct = toNum(channelSplits[ch]?.prime ?? primePct);
          const chNonPrimePct = toNum(channelSplits[ch]?.nonprime ?? nonPrimePct);
          const chPrimeAmount = (comBenefit * chPrimePct) / 100;
          const chNonPrimeAmount = (comBenefit * chNonPrimePct) / 100;
          const hasErr = perChannelSplitErrors[ch];

          return (
            <div key={ch} style={styles.card}>
              <div style={styles.head}>
                <div style={styles.headInfo}>
                  <img src={getLogoPath(ch)} alt={ch} style={styles.logo} onError={(e)=>{e.target.style.display='none';}} />
                  <div style={{ fontWeight: 'bold', fontSize: 16, color: '#2d3748' }}>{ch}</div>
                </div>
              </div>

              <div style={styles.amountBox}><strong>Channel Budget:</strong> {formatLKR(chAmount)}</div>
              <div style={styles.amountBox}><strong>Commercial Benefit:</strong> {formatLKR(comBenefit)}</div>

              <div style={styles.splitWrap}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...styles.label, minWidth: 90 }}>Prime Time:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={chPrimePct}
                    onChange={e => handleChannelSplitChange(ch, 'prime', e.target.value)}
                    style={{ ...styles.numberInput, width: 70, borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                  />
                  <span style={styles.percentSymbol}>%</span>
                  <span style={styles.amountBox}>{formatLKR(chPrimeAmount)}</span>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ ...styles.label, minWidth: 90 }}>Non-Prime:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={chNonPrimePct}
                    onChange={e => handleChannelSplitChange(ch, 'nonprime', e.target.value)}
                    style={{ ...styles.numberInput, width: 70, borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                  />
                  <span style={styles.percentSymbol}>%</span>
                  <span style={styles.amountBox}>{formatLKR(chNonPrimeAmount)}</span>
                </div>

                {hasErr && <div style={styles.error}>Prime + Non-Prime must total 100%</div>}
              </div>
            </div>
          );
        })}
          {benefitChannels.length === 1 && (
            <div
              style={{
                ...styles.card,
                visibility: 'hidden',
                height: 0,
                padding: 16,
                border: 'none'
              }}
            />
          )}
        </div>

      {/* Summary + controls */}
      <div className="side" style={styles.side}>
        <div className="half" style={styles.half}>
          <h3 style={styles.sectionTitle}>Global Defaults</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 250, fontWeight: 500, color: '#2d3748' }}>Prime Time % (global default):</label>
              <input type="number" step="0.01" value={primePct} onChange={e => setPrimePct(parseFloat(e.target.value))} style={styles.numberInput} />
              <span style={styles.percentSymbol}>%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 250, fontWeight: 500, color: '#2d3748' }}>Non-Prime Time % (global default):</label>
              <input type="number" step="0.01" value={nonPrimePct} onChange={e => setNonPrimePct(parseFloat(e.target.value))} style={styles.numberInput} />
              <span style={styles.percentSymbol}>%</span>
            </div>
            <button type="button" onClick={applyGlobalToAllChannels} style={{ marginTop: 8, padding: '6px 10px', border: '1px solid #cbd5e0', background: '#edf2f7', borderRadius: 6, cursor: 'pointer' }}>
              Apply to all channels
            </button>
          </div>
        </div>

        <div className="half" style={styles.half}>
          <h3 style={styles.sectionTitle}>Optimization Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 250, fontWeight: 500, color: '#2d3748' }}>Max Spot Bound (Override):</label>
              <input type="number" min="1" value={maxSpots} onChange={e => setMaxSpots(parseInt(e.target.value))} style={styles.numberInput} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ minWidth: 250, fontWeight: 500, color: '#2d3748' }}>Optimization Time Limit (seconds):</label>
              <input type="number" min="10" value={timeLimit} onChange={e => setTimeLimit(parseInt(e.target.value))} style={styles.numberInput} />
            </div>
          </div>
        </div>
      </div>

      {Number(optimizationInput?.numCommercials || 1) > 1 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Override Budget percentage per Commercial</h3>
          <div style={styles.commercialGrid}>
            {budgetProportions.map((val, idx) => (
              <div key={idx} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <label style={{ ...styles.label, minWidth: 110 }}>Commercial {idx + 1}:</label>
                <input
                  type="number"
                  step="0.01"
                  value={val}
                  onChange={e => handleBudgetProportionChange(idx, e.target.value)}
                  style={styles.smallInput}
                />
                <span style={styles.percentSymbol}>%</span>
              </div>
            ))}
          </div>
          <div style={{ background:'#edf2f7', padding:'8px 12px', borderRadius:6, fontSize:14, color:'#4a5568', marginTop:8 }}>
            Total must be 100% — Current: {budgetProportions.reduce((a,b)=>a+(isNaN(parseFloat(b))?0:parseFloat(b)),0).toFixed(2)}%
          </div>
        </div>
      )}

      {/* Buttons */}
      <div style={styles.buttonRow}>
        {!isProcessing ? (
          <>
            <button onClick={onBack} style={styles.backButton}>Go Back</button>
            <button onClick={handleSubmit} style={styles.primaryButton} disabled={disableOptimize}>
              Start Commercial Benefit Optimization
            </button>
          </>
        ) : (
          <>
            <p style={styles.processingMsg}>
              Optimization is processing. Please wait…
              {typeof countdown === 'number' && (
                <span style={{ marginLeft: 8, fontFamily: 'monospace', fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                  {formatMMSS(Math.max(0, countdown))}
                </span>
              )}
            </p>
            <button onClick={handleStop} style={styles.stopButton}>Stop Optimization</button>
          </>
        )}
      </div>

      {/* After success you’ll navigate to Bonus via App.js (step 7) */}
      <div style={{ marginTop: 8, color: '#4a5568' }}>
        {/* You can optionally show a “Proceed to Bonus” hint/button here after success, but we route from parent. */}
      </div>
      {result && (
      <div style={{ marginTop: '32px' }}>
        <CommercialBenefitResults
          result={result}
          onProceedToBonus={onProceedToBonus}   // 👈 pass from props
          onHome={onHome}                       // 👈 pass from props
          formatLKR={formatLKR}
        />
      </div>
    )}
    </div>
  );
}
