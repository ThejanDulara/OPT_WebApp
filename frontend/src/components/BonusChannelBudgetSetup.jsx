// BonusChannelBudgetSetup.jsx
import React, { useMemo, useState } from 'react';

export default function BonusChannelBudgetSetup({
  // Required inputs
  channels = [],                             // ['Derana', ...]
  channelMoney = {},                         // from previous step: { [ch]: { chAmount:number } }  (use chAmount as the "Channel Budget" base)
  optimizationInput = {},                    // from OptimizationSetup (numCommercials, durations, budgetProportions, maxSpots, timeLimit)
  // Nav
  onBack,
  onProceed                                   // (payload) => void  -> navigate to Bonus Program Selection
}) {
  // --- helpers ---
  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const fmtLKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  // --- seed from OptimizationSetup defaults ---
  const [numCommercials, setNumCommercials] = useState(optimizationInput.numCommercials || 1);
  const [durations, setDurations] = useState(
    (optimizationInput.durations && optimizationInput.durations.slice(0, optimizationInput.numCommercials)) ||
    Array(optimizationInput.numCommercials || 1).fill(30)
  );
  const [budgetProportions, setBudgetProportions] = useState(
    (optimizationInput.budgetProportions && optimizationInput.budgetProportions.slice(0, optimizationInput.numCommercials)) ||
    Array(optimizationInput.numCommercials || 1).fill(+(100 / (optimizationInput.numCommercials || 1)).toFixed(2))
  );

  // Global bonus-opt settings
  const [maxSpots, setMaxSpots]     = useState(optimizationInput.maxSpots ?? 10);
  const [timeLimit, setTimeLimit]   = useState(optimizationInput.timeLimit ?? 120);

  // Per-channel inputs
  const seededBonusPct = {};
  const seededBounds   = {};
  (channels || []).forEach(ch => {
    seededBonusPct[ch] = 0;                                         // default 0% until user enters
    // default bound: reuse global bound if present, otherwise 0
    seededBounds[ch] = num(optimizationInput.budgetBound ?? 0);
  });

  const [bonusPctByChannel, setBonusPctByChannel] = useState(seededBonusPct);
  const [channelBounds, setChannelBounds]         = useState(seededBounds);

  const handleBonusPctChange = (ch, v) => {
    setBonusPctByChannel(prev => ({ ...prev, [ch]: num(v) }));
  };
  const handleBoundChange = (ch, v) => {
    setChannelBounds(prev => ({ ...prev, [ch]: Math.max(0, num(v)) }));
  };

  // Derived: base channel budget and bonus budget per channel
  const baseChannelBudget = useMemo(() => {
    const map = {};
    (channels || []).forEach(ch => {
      const base = num(channelMoney?.[ch]?.chAmount); // from channel share step
      map[ch] = base;
    });
    return map;
  }, [channels, channelMoney]);

  const bonusBudget = useMemo(() => {
    const map = {};
    (channels || []).forEach(ch => {
      const base = baseChannelBudget[ch] || 0;
      const pct  = num(bonusPctByChannel[ch]);
      map[ch] = (base * pct) / 100.0;
    });
    return map;
  }, [channels, baseChannelBudget, bonusPctByChannel]);

  // Derived: per-channel, per-commercial budgets off bonus budget
  const perChannelCommercialBudgets = useMemo(() => {
    const out = {};
    (channels || []).forEach(ch => {
      const b = bonusBudget[ch] || 0;
      out[ch] = (budgetProportions || []).map(p => (b * num(p)) / 100.0);
    });
    return out;
  }, [channels, bonusBudget, budgetProportions]);

  // Validation helpers
  const totalPct = budgetProportions.reduce((a, b) => a + num(b), 0);
  const pctOk    = Math.abs(totalPct - 100) <= 0.01;

  const handleNumCommercialsChange = (next) => {
    const n = Math.max(1, parseInt(next || 1, 10));
    setNumCommercials(n);

    // resize durations
    const d = durations.slice(0, n);
    while (d.length < n) d.push(30);
    setDurations(d);

    // even split by default, keep previous where possible
    const even = Math.floor(100 / n);
    const rest = 100 - even * n;
    const p = budgetProportions.slice(0, n);
    while (p.length < n) p.push(even);
    if (rest > 0) p[n - 1] = num(p[n - 1]) + rest;
    setBudgetProportions(p);
  };

  const handleDurationChange = (i, v) => {
    const d = [...durations];
    d[i] = num(v);
    setDurations(d);
  };

  const handlePctChange = (i, v) => {
    const p = [...budgetProportions];
    p[i] = num(v);
    setBudgetProportions(p);
  };

  const handleProceed = () => {
    // guardrails
    if (timeLimit < 60) {
      alert('⏱ Optimization time limit must be at least 60 seconds.');
      return;
    }
    if (!pctOk) {
      alert('Commercial budget percentages must total 100%.');
      return;
    }

    // assemble payload for next pages
    const payload = {
      numCommercials,
      durations: durations.map(num),
      budgetProportions: budgetProportions.map(num),
      maxSpots: parseInt(maxSpots, 10),
      timeLimit: parseInt(timeLimit, 10),

      // bonus specifics
      bonusPctByChannel,                 // { ch: % }
      bonusBudget,                       // { ch: Rs }
      channelAllowPctByChannel: channelBounds,                     // { ch: ± Rs } (used as channel-level budget tolerance in bonus opt)
      baseChannelBudget,                 // { ch: Rs } (for reference)
      perChannelCommercialBudgets        // { ch: [Rs, Rs, ...] }
    };

    onProceed && onProceed(payload);
  };

  // --- styles (aligned with your existing look) ---
  const styles = {
    page: { padding: '32px', maxWidth: 1200, margin: '0 auto', background: '#d5e9f7', borderRadius: 12 },
    title: { fontSize: 24, fontWeight: 600, color: '#2d3748', marginBottom: 16 },
    section: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 20, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 600, color: '#2d3748', marginBottom: 12, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 },
    card: { background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    row: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'nowrap' },
    label: { minWidth: 140, color: '#2d3748', fontWeight: 500, fontSize: 14 },
    input: { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14, minWidth: 100, textAlign: 'right' },
    pill: { background: '#edf2f7', padding: '6px 10px', borderRadius: 6, fontSize: 13 },
    channelHeader: { fontWeight: 700, color: '#2d3748', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 },
    smallNote: { fontSize: 12, color: '#718096' },
    pctHint: (ok) => ({ marginTop: 6, fontSize: 13, color: ok ? '#2f855a' : '#e53e3e', background: '#edf2f7', padding: '6px 10px', borderRadius: 6 }),
    buttons: { display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' },
    backBtn: { padding: '12px 20px', background: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: 6, fontWeight: 500, cursor: 'pointer' },
    nextBtn: { padding: '12px 20px', background: '#4299e1', color: 'white', border: 'none', borderRadius: 6, fontWeight: 500, cursor: 'pointer' },
    logo: { height: 34, width: 'auto', objectFit: 'contain', borderRadius: 4 },
    twoCol: {
      display: 'grid',
      gridTemplateColumns: 'minmax(240px,1fr) minmax(240px,1fr)', // prevents narrow wrap
      gap: 16,
      alignItems: 'center',
      marginBottom: 8
    },
    formGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'nowrap'                // keep label + input on one line
    },
    formLabel: {
      marginBottom: 0,                  // no vertical spacing now
      fontSize: 14,
      fontWeight: 500,
      color: '#2d3748'
    },

  };

  const getLogoPath = (channel) => `/logos/${channel}.png`;

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Bonus Program Optimization Setup</h2>

      {/* Global commercials setup */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Commercials (Percentages & Durations)</div>

        <div className="num-commercials" style={{ ...styles.row, marginBottom: 12 }}>
          <span style={styles.label}>Number of Commercials:</span>
          <input
            type="number"
            min={1}
            value={numCommercials}
            onChange={(e) => handleNumCommercialsChange(e.target.value)}
            style={{ ...styles.input, width: 80, textAlign: 'center' }}
          />
        </div>

        {Array.from({ length: numCommercials }).map((_, i) => (
          <div key={i} style={{ ...styles.card, marginBottom: 10 }}>
            <div style={{ ...styles.row, marginBottom: 6 }}>
              <strong>Commercial {i + 1}</strong>
            </div>

            <div style={styles.twoCol}>
              <div style={styles.formGroup}>
                <span style={styles.formLabel}>Duration (sec):</span>
                <input
                  type="number"
                  min={1}
                  value={durations[i] ?? 0}
                  onChange={(e) => handleDurationChange(i, e.target.value)}
                  style={{ ...styles.input, width: 100 }}
                />
              </div>

              <div style={styles.formGroup}>
                <span style={styles.formLabel}>Budget %:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    value={budgetProportions[i] ?? 0}
                    onChange={(e) => handlePctChange(i, e.target.value)}
                    style={{ ...styles.input, width: 100 }}
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div style={styles.pctHint(pctOk)}>
          Total must be 100% — Current Total: {totalPct.toFixed(2)}%
        </div>
      </div>

      {/* Channels */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Channel Cards</div>
        <div style={styles.grid}>
          {(channels || []).map((ch) => {
            const base = baseChannelBudget[ch] || 0;
            const bonus = bonusBudget[ch] || 0;
            const comBudgets = perChannelCommercialBudgets[ch] || [];
            return (
              <div key={ch} style={styles.card}>
                <div style={styles.channelHeader}>
                  <img src={getLogoPath(ch)} alt={ch} style={styles.logo} onError={(e)=>{e.currentTarget.style.display='none';}} />
                  <span>{ch}</span>
                </div>

                <div style={styles.row}>
                  <span style={styles.label}>Channel Budget:</span>
                  <span style={styles.pill}>{fmtLKR(base)}</span>
                </div>

                <div style={styles.row}>
                  <span style={styles.label}>Bonus %:</span>
                  <input
                    type="number"
                    min={0}
                    value={bonusPctByChannel[ch] ?? 0}
                    onChange={(e) => handleBonusPctChange(ch, e.target.value)}
                    style={{ ...styles.input, width: 100 }}
                  />
                  <span>%</span>
                </div>

                <div style={styles.row}>
                  <span style={styles.label}>Bonus Budget:</span>
                  <span style={styles.pill}>{fmtLKR(bonus)}</span>
                </div>

                <div style={{ ...styles.row, marginTop: 10 }}>
                  <span style={{ ...styles.label, minWidth: 180 }}>Commercial-wise Budgets:</span>
                </div>
                {comBudgets.map((val, i) => (
                  <div key={i} style={{ ...styles.row, marginLeft: 8 }}>
                    <span style={{ minWidth: 90 }}>Com {i + 1}:</span>
                    <span style={styles.pill}>{fmtLKR(val)}</span>
                    <span style={styles.smallNote}>
                      ({num(budgetProportions[i])}% of bonus; {num(durations[i])}s)
                    </span>
                  </div>
                ))}

                <div style={{ ...styles.row, marginTop: 12 }}>
                  <span style={styles.label}>± Allowable Channel Budget (Rs.):</span>
                  <input
                    type="number"
                    min={0}
                    value={channelBounds[ch] ?? 0}
                    onChange={(e) => handleBoundChange(ch, e.target.value)}
                    style={{ ...styles.input, width: 140 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimization settings */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Optimization Settings</div>
        <div style={styles.row}>
          <span style={styles.label}>Max Spot Bound:</span>
          <input
            type="number"
            min={1}
            value={maxSpots}
            onChange={(e)=>setMaxSpots(parseInt(e.target.value || 0, 10))}
            style={{ ...styles.input, width: 120 }}
          />
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Time Limit (seconds):</span>
          <input
            type="number"
            min={60}
            value={timeLimit}
            onChange={(e)=>setTimeLimit(parseInt(e.target.value || 0, 10))}
            style={{ ...styles.input, width: 120 }}
          />
        </div>
        <div style={styles.smallNote}>
          These default to the values you used in Optimization Setup; adjust only if needed for the bonus run.
        </div>
      </div>

      <div style={styles.buttons}>
        <button type="button" onClick={onBack} style={styles.backBtn}>Go Back</button>
        <button
          type="button"
          onClick={handleProceed}
          style={{ ...styles.nextBtn, opacity: pctOk ? 1 : 0.7 }}
          disabled={!pctOk}
        >
          Review Bonus Program Table
        </button>
      </div>
    </div>
  );
}
