// BonusChannelBudgetSetup.jsx
import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';

export default function BonusChannelBudgetSetup({
  channels = [],
  channelMoney = {},
  optimizationInput = {},
  initialState = null,
  onSaveState = () => {},
  onBack,
  onProceed
}) {
  // --- helpers ---
  const num = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  const fmtLKR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  // Number of commercials
  const [numCommercials, setNumCommercials] = useState(
    initialState?.numCommercials ??
    optimizationInput?.numCommercials ??
    1
  );

  // Durations
  const [durations, setDurations] = useState(
    initialState?.durations ??
    (
      optimizationInput?.durations?.slice(0, optimizationInput?.numCommercials) ??
      Array(optimizationInput?.numCommercials || 1).fill(30)
    )
  );

  // Global budget proportions (default)
  const [budgetProportions, setBudgetProportions] = useState(
    initialState?.budgetProportions ??
    (
      optimizationInput?.budgetProportions?.slice(0, optimizationInput?.numCommercials) ??
      Array(optimizationInput?.numCommercials || 1).fill(
        +(100 / (optimizationInput?.numCommercials || 1)).toFixed(2)
      )
    )
  );

  // NEW: Channel-specific commercial splits
  const [channelCommercialSplits, setChannelCommercialSplits] = useState(() => {
    if (initialState?.channelCommercialSplits) return initialState.channelCommercialSplits;

    // Initialize with global proportions for each channel
    const seed = {};
    (channels || []).forEach(ch => {
      seed[ch] = (budgetProportions || []).map(v => num(v));
    });
    return seed;
  });

  // Max spots
  const [maxSpots, setMaxSpots] = useState(
    initialState?.maxSpots ??
    optimizationInput?.maxSpots ??
    10
  );

    const [channelMaxSpots, setChannelMaxSpots] = useState(
      initialState?.channelMaxSpots ??
      channels.reduce((acc, ch) => {
        acc[ch] = optimizationInput?.maxSpots ?? 10;  // default = global
        return acc;
      }, {})
    );

    const [channelWeekendMaxSpots, setChannelWeekendMaxSpots] = useState(
      initialState?.channelWeekendMaxSpots ??
      channels.reduce((acc, ch) => {
        acc[ch] = initialState?.channelMaxSpots?.[ch] ?? optimizationInput?.maxSpots ?? 10;
        return acc;
      }, {})
    );

  // Time limit
  const [timeLimit, setTimeLimit] = useState(
    initialState?.timeLimit ??
    optimizationInput?.timeLimit ??
    120
  );

  // Bonus % per channel
  const [bonusPctByChannel, setBonusPctByChannel] = useState(
    initialState?.bonusPctByChannel ??
    channels.reduce((acc, ch) => {
      acc[ch] = 0;
      return acc;
    }, {})
  );

  // Channel budget tolerance
  const [channelBounds, setChannelBounds] = useState(
    initialState?.channelBounds ??
    channels.reduce((acc, ch) => {
      acc[ch] = optimizationInput?.budgetBound ?? 0;
      return acc;
    }, {})
  );

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
      const base = num(channelMoney?.[ch]?.chAmount);
      map[ch] = base;
    });
    return map;
  }, [channels, channelMoney]);

  const bonusBudget = useMemo(() => {
    const map = {};
    (channels || []).forEach(ch => {
      const base = baseChannelBudget[ch] || 0;
      const pct = num(bonusPctByChannel[ch]);
      map[ch] = (base * pct) / 100.0;
    });
    return map;
  }, [channels, baseChannelBudget, bonusPctByChannel]);

  // Derived: per-channel, per-commercial budgets using channel-specific splits
  const perChannelCommercialBudgets = useMemo(() => {
    const out = {};
    (channels || []).forEach(ch => {
      const b = bonusBudget[ch] || 0;
      const splits = channelCommercialSplits[ch] || budgetProportions.map(v => num(v));
      out[ch] = splits.map(p => (b * num(p)) / 100.0);
    });
    return out;
  }, [channels, bonusBudget, budgetProportions, channelCommercialSplits]);

  // Handle channel commercial split changes
  const handleChannelCommercialChange = (ch, idx, val) => {
    setChannelCommercialSplits(prev => {
      const next = Array.isArray(prev[ch]) ? [...prev[ch]] : [];
      next[idx] = num(val);
      return { ...prev, [ch]: next };
    });
  };

  // Apply global commercial percentages to all channels
  const applyGlobalCommercialToAllChannels = () => {
    const next = {};
    (channels || []).forEach(ch => {
      next[ch] = budgetProportions.map(v => num(v));
    });
    setChannelCommercialSplits(next);
    toast.info('Applied global commercial percentages to all channels');
  };

  // Validation helpers
  const totalPct = budgetProportions.reduce((a, b) => a + num(b), 0);
  const pctOk = Math.abs(totalPct - 100) <= 0.01;

  // Validate channel commercial splits
  const channelCommercialErrors = useMemo(() => {
    const errs = {};
    (channels || []).forEach(ch => {
      const arr = channelCommercialSplits[ch] || budgetProportions.map(v => num(v));
      const sum = arr.reduce((a, v) => a + num(v), 0);
      if (Math.abs(sum - 100) > 0.01) errs[ch] = true;
    });
    return errs;
  }, [channels, channelCommercialSplits, budgetProportions, num]);

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

    // Update channel splits for new number of commercials
    setChannelCommercialSplits(prev => {
      const nextSplits = {};
      (channels || []).forEach(ch => {
        const current = prev[ch] || [];
        const newArr = current.slice(0, n);
        while (newArr.length < n) newArr.push(even);
        nextSplits[ch] = newArr;
      });
      return nextSplits;
    });
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
      alert('Global commercial budget percentages must total 100%.');
      return;
    }

    // Check channel commercial splits
    const hasChannelErrors = Object.keys(channelCommercialErrors).length > 0;
    if (hasChannelErrors) {
      alert("Some channels have commercial splits that don't total 100%. Please fix them.");
      return;
    }

    // ⭐ SAVE STATE
    onSaveState({
      numCommercials,
      durations,
      budgetProportions,
      channelCommercialSplits,
      maxSpots,
      timeLimit,
      bonusPctByChannel,
      channelBounds,
      channelMaxSpots,
      channelWeekendMaxSpots
    });

    // assemble payload for next pages
    const payload = {
      numCommercials,
      durations: durations.map(num),
      budgetProportions: budgetProportions.map(num),
      maxSpots: parseInt(maxSpots, 10),
      timeLimit: parseInt(timeLimit, 10),
      channel_max_spots: channelMaxSpots,
      channel_weekend_max_spots: channelWeekendMaxSpots,

      // bonus specifics
      bonusPctByChannel,
      bonusBudget,
      channelAllowPctByChannel: channelBounds,
      baseChannelBudget,
      commercial_budgets: perChannelCommercialBudgets,

      // NEW: channel-specific commercial percentages
      channel_commercial_pct_map: channelCommercialSplits
    };

    onProceed && onProceed(payload);
  };

  // --- styles ---
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
      gridTemplateColumns: 'minmax(240px,1fr) minmax(240px,1fr)',
      gap: 16,
      alignItems: 'center',
      marginBottom: 8
    },
    formGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'nowrap'
    },
    formLabel: {
      marginBottom: 0,
      fontSize: 14,
      fontWeight: 500,
      color: '#2d3748'
    },
    errorText: { color: '#e53e3e', fontSize: 12, marginTop: 4 },
    commercialSplitRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
      marginLeft: 8
    },
    applyGlobalBtn: {
      marginTop: 8,
      padding: '6px 10px',
      border: '1px solid #cbd5e0',
      background: '#edf2f7',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 14
    },
    commercialHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      marginBottom: 8
    },
    commercialPctInput: {
      width: 44,
      padding: '6px 6px',
      fontSize: 13,
      textAlign: 'center',
      border: '1px solid #e2e8f0',
      borderRadius: 6
    }

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

        <button
          type="button"
          onClick={applyGlobalCommercialToAllChannels}
          style={styles.applyGlobalBtn}
        >
          Apply these percentages to all channels
        </button>
      </div>

      {/* Channels */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Channel Cards</div>
        <div style={styles.grid}>
          {(channels || []).map((ch) => {
            const base = baseChannelBudget[ch] || 0;
            const bonus = bonusBudget[ch] || 0;
            const comBudgets = perChannelCommercialBudgets[ch] || [];
            const channelSplits = channelCommercialSplits[ch] || budgetProportions.map(v => num(v));
            const hasError = channelCommercialErrors[ch];

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

                <div style={styles.commercialHeader}>
                  <span style={{ ...styles.label, minWidth: 180 }}>Commercial-wise Budgets:</span>
                  <span style={styles.smallNote}>Override percentages:</span>
                </div>

                {comBudgets.map((val, i) => {
                  const splitPct = channelSplits[i] || 0;
                  const amt = (bonus * splitPct) / 100;

                  return (
                    <div key={i} style={styles.commercialSplitRow}>
                      <span style={{ minWidth: 90 }}>Com {i + 1}:</span>
                        <input
                          type="number"
                          value={splitPct}
                          onChange={(e) => handleChannelCommercialChange(ch, i, e.target.value)}
                          style={{
                            ...styles.commercialPctInput,
                            borderColor: hasError ? '#e53e3e' : '#e2e8f0'
                          }}
                        />

                      <span>%</span>
                      <span style={styles.pill}>{fmtLKR(amt)}</span>
                      <span style={styles.smallNote}>
                        ({num(durations[i])}s)
                      </span>
                    </div>
                  );
                })}

                {hasError && (
                  <div style={styles.errorText}>Commercial splits must total 100%</div>
                )}

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

                <div style={styles.row}>
                  <span style={styles.label}>Max Spots per Program:</span>
                  <input
                    type="number"
                    min={1}
                    value={channelMaxSpots[ch] ?? maxSpots}
                    onChange={(e) =>
                      setChannelMaxSpots(prev => ({
                        ...prev,
                        [ch]: parseInt(e.target.value)
                      }))
                    }
                    style={{ ...styles.input, width: 120 }}
                  />
                </div>

                <div style={styles.row}>
                  <span style={styles.label}>Max Spots (WE Program):</span>
                  <input
                    type="number"
                    min={1}
                    value={channelWeekendMaxSpots[ch] ?? channelMaxSpots[ch] ?? maxSpots}
                    onChange={(e) =>
                      setChannelWeekendMaxSpots(prev => ({
                        ...prev,
                        [ch]: parseInt(e.target.value)
                      }))
                    }
                    style={{ ...styles.input, width: 120 }}
                  />
                  <span style={styles.smallNote}>Weekend only</span>
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