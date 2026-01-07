// ChannelBudgetSetup.jsx
import React, { useEffect, useState } from 'react';
import PropertyProgramsEditor from './PropertyProgramsEditor';

export default function ChannelBudgetSetup({
  channels,
  optimizationInput,
  // state + setters / handlers
  usePercentageMode,
  setUsePercentageMode,
  budgetShares, setBudgetShares,
  maxSpots, setMaxSpots,
  timeLimit, setTimeLimit,
  primePct, setPrimePct,
  nonPrimePct, setNonPrimePct,
  hasProperty, toggleProperty,
  propertyAmounts, handlePropertyAmount,
  channelSplits, handleChannelSplitChange,
  budgetProportions, handleBudgetProportionChange,
  perChannelSplitErrors,
  propertyPrograms, setPropertyPrograms,
  // derived
  totalBudget, enteredPctTotal, totalProperty, totalAvailable, channelMoney,
  // helpers
  toNumber, formatLKR, applyGlobalToAllChannels,
  // actions
  onBack, onSubmit, onStop, isProcessing,
  // validation
  propertyValidation,
  // styles
  styles,
  // ✅ NEW: get from parent instead of local
  propertyPercents, setPropertyPercents,
  // NEW: per-channel commercial splits
  channelCommercialSplits, handleChannelCommercialSplitChange,
  perChannelCommercialErrors,
  applyGlobalCommercialsToAllChannels

})

{
      const formatWithCommas = (value) => {
      if (value === '' || value === null || value === undefined) return '';
      return Number(value).toLocaleString('en-LK');
    };

    const removeCommas = (value) => value.replace(/,/g, '');

  const handleInputChange = (channel, value) => {
    setBudgetShares(prev => ({ ...prev, [channel]: toNumber(value) }));
  };

  // Countdown for processing
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
          if (prev <= 1) {
            clearInterval(id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(null);
    }
    return () => { if (id) clearInterval(id); };
  }, [isProcessing, timeLimit]);

  // disable optimize if property program totals don't match or while processing
  const disableOptimize = isProcessing || (propertyValidation && !propertyValidation.ok);
  const anyPropertyOn = Object.values(hasProperty || {}).some(Boolean);

  const handlePercentChange = (ch, which, val) => {
    let numVal = toNumber(val);
    if (numVal < 0) numVal = 0;
    if (numVal > 100) numVal = 100;

    setPropertyPercents(prev => {
      const current = prev[ch] || { onCostPct: 20, comBenefitPct: 80 };
      let updated = { ...current, [which]: numVal };

      // Keep total = 100%
      if (which === 'onCostPct') {
        updated.comBenefitPct = 100 - numVal;
      } else {
        updated.onCostPct = 100 - numVal;
      }

      return { ...prev, [ch]: updated };
    });
  };

  // Function to get channel logo path
  const getLogoPath = (channel) => `/logos/${channel}.png`;

  // Enhanced styles
  const enhancedStyles = {
    ...styles,
    channelCard: {
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '16px',
      flex: '1',
      minWidth: '300px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
    },
    channelRow: {
      display: 'flex',
      gap: '20px',
      marginBottom: '20px'
    },
    channelHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: '1px solid #e2e8f0'
    },
    channelInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    channelLogo: {
      height: '40px',
      width: 'auto',
      objectFit: 'contain',
      borderRadius: '4px'
    },
    channelName: {
      fontWeight: 'bold',
      fontSize: '16px',
      color: '#2d3748'
    },
    inputRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
      flexWrap: 'wrap'
    },
    percentInput: {
      width: '50px',
      padding: '4px 6px',
      border: '1px solid #e2e8f0',
      borderRadius: '4px',
      fontSize: '13px',
      textAlign: 'right'
    },
    amountRow: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      marginBottom: '12px'
    },
    amountBox: {
      padding: '6px 10px',
      backgroundColor: '#edf2f7',
      borderRadius: '4px',
      fontSize: '13px'
    },
    splitContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      backgroundColor: '#f1f5f9',
      borderRadius: '4px',
      marginBottom: '8px'
    },

    summaryBox: {
      marginTop: 16,
      marginBottom: 24,
      padding: '16px',
      backgroundColor: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      width: '46.5%'   // 👈 half width, left corner aligned
    },

    summaryRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '14px',
      color: '#2d3748'
    },
    summaryLabel: {
      fontWeight: 500,
      color: '#4a5568'
    },
    summaryValue: {
      fontWeight: 700,
      color: '#2d3748'
    },

    // 🔁 Re-added containers & helpers
    sectionContainer: {
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '20px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#2d3748',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '2px solid #e2e8f0'
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginBottom: '16px'
    },
    commercialGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '40px',
      marginBottom: '12px'
    },
    commercialInput: {
      display: 'flex',
      alignItems: 'center',
      gap: '1px'
    },
    totalHint: {
      backgroundColor: '#edf2f7',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      color: '#4a5568',
      marginTop: '8px'
    },
    overrideInputRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 0',
      borderBottom: '1px solid #f1f5f9'
    },
    overrideLabel: {
      minWidth: '250px',
      fontWeight: '500',
      color: '#2d3748'
    },
    sideBySideContainer: {
      display: 'flex',
      gap: '20px',
      marginBottom: '20px',
      flexWrap: 'wrap'
    },
    halfWidthSection: {
      flex: '1',
      minWidth: '400px',
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    }
  };

  // Group channels into rows of two
  const channelRows = [];
  for (let i = 0; i < channels.length; i += 2) {
    channelRows.push(channels.slice(i, i + 2));
  }

  const handleStartOptimization = () => {
    const channelMoneyMap = {};
    channels.forEach((ch) => {
      const pct = Number(budgetShares[ch] || 0);
      const chAmount = (totalBudget * pct) / 100;
      const propTotal = Number(propertyAmounts[ch] || 0);
      const { onCostPct, comBenefitPct } = propertyPercents[ch] || { onCostPct: 20, comBenefitPct: 80 };
      const onCost = (propTotal * onCostPct) / 100;
      const comBenefit = (propTotal * comBenefitPct) / 100;
      // Available stays = channel budget – property amount
      const available = Math.max(0, chAmount - propTotal);

      channelMoneyMap[ch] = { chAmount, prop: propTotal, onCost, comBenefit, available };
    });

    const payload = { channelMoney: channelMoneyMap };
    console.log('Final payload being sent:', payload);
    onSubmit && onSubmit(payload);
  };

  return (
    <>
    {/* 🔁 Budget Input Mode */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={usePercentageMode}
              onChange={e => setUsePercentageMode(e.target.checked)}
            />
            Input budget as percentage
          </label>
        </div>
      {/* Channel rows - Two channels per row */}
      <div style={{ marginBottom: '20px' }}>
        {channelRows.map((row, rowIndex) => (
          <div key={rowIndex} style={enhancedStyles.channelRow}>
            {row.map((ch) => {
              const chAmount = channelMoney[ch]?.chAmount || 0;
              const propTotal = channelMoney[ch]?.prop || 0;
              const { onCostPct, comBenefitPct } = propertyPercents[ch] || { onCostPct: 20, comBenefitPct: 80 };
              const onCost = (propTotal * onCostPct) / 100;
              const comBenefit = (propTotal * comBenefitPct) / 100;
              const available = Math.max(0, chAmount - propTotal);

              const chPrimePct = toNumber(channelSplits[ch]?.prime ?? primePct);
              const chNonPrimePct = toNumber(channelSplits[ch]?.nonprime ?? nonPrimePct);
              const chPrimeAmount = (available * chPrimePct) / 100;
              const chNonPrimeAmount = (available * chNonPrimePct) / 100;
              const hasErr = perChannelSplitErrors[ch];

              return (
                <div key={ch} style={enhancedStyles.channelCard}>
                  {/* Channel header */}
                  <div style={enhancedStyles.channelHeader}>
                    <div style={enhancedStyles.channelInfo}>
                      <img
                        src={getLogoPath(ch)}
                        alt={ch}
                        style={enhancedStyles.channelLogo}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div style={enhancedStyles.channelName}>{ch}</div>
                    </div>

                    {/* Property toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={!!hasProperty[ch]}
                        onChange={() => toggleProperty(ch)}
                        style={styles.checkbox}
                      />
                      Has Property
                    </label>
                  </div>

                  {/* Channel percentage input */}
                  <div style={enhancedStyles.inputRow}>
                    <label style={{ ...styles.label, minWidth: '100px' }}>Budget Share:</label>
                    {/* Channel Budget (Amount) */}
                    <input
                      type="text"
                      disabled={usePercentageMode}
                      value={formatWithCommas(channelMoney[ch]?.chAmount || 0)}
                      onChange={e => {
                        if (usePercentageMode) return;

                        const raw = removeCommas(e.target.value);
                        if (!/^\d*$/.test(raw)) return;

                        const amt = toNumber(raw);
                        setBudgetShares(prev => ({
                          ...prev,
                          [ch]: totalBudget > 0 ? (amt / totalBudget) * 100 : 0
                        }));
                      }}
                      style={{
                        ...styles.numberInput,
                        width: '110px',
                        backgroundColor: usePercentageMode ? '#edf2f7' : 'white'
                      }}
                    />
                    <span>LKR</span>

                    {/* Channel Share (%) */}
                    <input
                      type="number"
                      disabled={!usePercentageMode}
                      value={usePercentageMode ? (budgetShares[ch] ?? '') : 0}
                      onChange={e => {
                        if (!usePercentageMode) return;
                        handleInputChange(ch, e.target.value);
                      }}
                      style={{
                        ...styles.numberInput,
                        width: '70px',
                        backgroundColor: !usePercentageMode ? '#edf2f7' : 'white'
                      }}
                    />
                    <span>%</span>

                  </div>

                  {/* Property amount & percentage inputs */}
                  {hasProperty[ch] && (
                    <>
                      <div style={enhancedStyles.inputRow}>
                        <label style={{ ...styles.label, minWidth: '100px' }}>Property Amount:</label>
                        <input
                          type="text"
                          value={formatWithCommas(propertyAmounts[ch] ?? '')}
                          onChange={e => {
                            const rawValue = removeCommas(e.target.value);

                            // allow only digits
                            if (!/^\d*$/.test(rawValue)) return;

                            handlePropertyAmount(ch, rawValue);
                          }}
                          style={{ ...styles.numberInput, width: '120px' }}
                          inputMode="numeric"
                        />

                        <span>LKR</span>
                      </div>

                      <div style={enhancedStyles.inputRow}>
                        <span>On cost</span>
                        <input
                          type="number"
                          value={onCostPct}
                          onChange={e => handlePercentChange(ch, 'onCostPct', e.target.value)}
                          style={enhancedStyles.percentInput}
                        />
                        <span>%</span>
                        <span>Com. Benefit</span>
                        <input
                          type="number"
                          value={comBenefitPct}
                          onChange={e => handlePercentChange(ch, 'comBenefitPct', e.target.value)}
                          style={enhancedStyles.percentInput}
                        />
                        <span>%</span>
                      </div>
                    </>
                  )}

                  {/* Calculated amounts */}
                  <div style={enhancedStyles.amountRow}>
                    <div style={enhancedStyles.amountBox}>
                      <strong>Channel Budget:</strong> {formatLKR(chAmount)}
                    </div>
                    <div style={enhancedStyles.amountBox}>
                      <strong>Property Cost:</strong> {formatLKR(propTotal)}
                    </div>
                    {hasProperty[ch] && (
                      <>
                        <div style={enhancedStyles.amountBox}>
                          <strong>Commercial Benefit:</strong> {formatLKR(comBenefit)}
                        </div>
                        <div style={enhancedStyles.amountBox}>
                          <strong>Property On cost:</strong> {formatLKR(onCost)}
                        </div>
                      </>
                    )}
                    <div style={enhancedStyles.amountBox}>
                      <strong>Spot Buying:</strong> {formatLKR(available)}
                    </div>
                  </div>

                  {/* PT/NPT split editor */}
                  <div style={enhancedStyles.splitContainer}>
                    <div style={enhancedStyles.inputRow}>
                      <span style={{ ...styles.label, minWidth: '80px' }}>Prime Time:</span>
                      <input
                        type="number"
                        value={channelSplits[ch]?.prime ?? primePct}
                        onChange={e => handleChannelSplitChange(ch, 'prime', e.target.value)}
                        style={{ ...styles.numberInput, width: '70px', borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                      />
                      <span style={styles.percentSymbol}>%</span>
                      <span style={enhancedStyles.amountBox}>
                        {formatLKR(chPrimeAmount)}
                      </span>
                    </div>

                    <div style={enhancedStyles.inputRow}>
                      <span style={{ ...styles.label, minWidth: '80px' }}>Non-Prime Time:</span>
                      <input
                        type="number"
                        value={channelSplits[ch]?.nonprime ?? nonPrimePct}
                        onChange={e => handleChannelSplitChange(ch, 'nonprime', e.target.value)}
                        style={{ ...styles.numberInput, width: '70px', borderColor: hasErr ? '#e53e3e' : '#e2e8f0' }}
                      />
                      <span style={styles.percentSymbol}>%</span>
                      <span style={enhancedStyles.amountBox}>
                        {formatLKR(chNonPrimeAmount)}
                      </span>
                    </div>

                    {hasErr && (
                      <div style={{ color: '#e53e3e', fontSize: 12, marginTop: '4px' }}>
                        Prime + Non-Prime must total 100%
                      </div>
                    )}
                  </div>

                  {Number(optimizationInput?.numCommercials) > 1 && (
                      <div style={enhancedStyles.splitContainer}>
                        {Array.from({ length: Number(optimizationInput?.numCommercials || 1) }).map((_, idx2) => {
                          const globalPct = toNumber(budgetProportions?.[idx2] ?? 0);
                          const chPct = toNumber(channelCommercialSplits?.[ch]?.[idx2] ?? globalPct);
                          const chAmt = (available * chPct) / 100;

                          const hasCommErr = !!perChannelCommercialErrors?.[ch];

                          return (
                            <div key={idx2} style={enhancedStyles.inputRow}>
                              <span style={{ ...styles.label, minWidth: '80px' }}>
                                Com {idx2 + 1}:
                              </span>

                              <input
                                type="number"
                                value={channelCommercialSplits?.[ch]?.[idx2] ?? budgetProportions?.[idx2] ?? ''}
                                onChange={e => handleChannelCommercialSplitChange(ch, idx2, e.target.value)}
                                style={{ ...styles.numberInput, width: '70px', borderColor: hasCommErr ? '#e53e3e' : '#e2e8f0' }}
                              />
                              <span style={styles.percentSymbol}>%</span>

                              <span style={enhancedStyles.amountBox}>
                                {formatLKR(chAmt)}
                              </span>
                            </div>
                          );
                        })}

                        {!!perChannelCommercialErrors?.[ch] && (
                          <div style={{ color: '#e53e3e', fontSize: 12, marginTop: '4px' }}>
                            Commercial % must total 100% for this channel
                          </div>
                        )}
                      </div>
                    )}
                </div>
              );
            })}

            {/* Layout fix for odd row */}
            {row.length === 1 && (
              <div style={{ ...enhancedStyles.channelCard, visibility: 'hidden', height: 0, padding: 16, border: 'none' }}></div>
            )}
          </div>
        ))}
      </div>

      {/* Summary box */}
      <div style={enhancedStyles.summaryBox}>
        <div style={enhancedStyles.summaryRow}>
          <span style={enhancedStyles.summaryLabel}>Entered Channel % Total:</span>
          <span style={enhancedStyles.summaryValue}>{enteredPctTotal.toFixed(2)}%</span>
        </div>
        <div style={enhancedStyles.summaryRow}>
          <span style={enhancedStyles.summaryLabel}>Total Budget:</span>
          <span style={enhancedStyles.summaryValue}>{formatLKR(totalBudget)}</span>
        </div>
        <div style={enhancedStyles.summaryRow}>
          <span style={enhancedStyles.summaryLabel}>Property Total:</span>
          <span style={enhancedStyles.summaryValue}>{formatLKR(totalProperty)}</span>
        </div>
        <div style={enhancedStyles.summaryRow}>
          <span style={enhancedStyles.summaryLabel}>Optimizable Total (Spot Buying):</span>
          <span style={enhancedStyles.summaryValue}>{formatLKR(totalAvailable)}</span>
        </div>
        <div style={enhancedStyles.summaryRow}>
          <span style={enhancedStyles.summaryLabel}>Global PT/NPT defaults:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={enhancedStyles.summaryValue}>{toNumber(primePct)}% / {toNumber(nonPrimePct)}%</span>
            <button type="button" onClick={applyGlobalToAllChannels} style={styles.smallSyncBtn}>
              Apply to all channels
            </button>
          </div>
        </div>
          {Number(optimizationInput?.numCommercials) > 1 && (
          <div style={enhancedStyles.summaryRow}>
            <span style={enhancedStyles.summaryLabel}>Global Commercial defaults:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={enhancedStyles.summaryValue}>
                {budgetProportions.map((p, i) => `C${i + 1}:${toNumber(p)}%`).join('  ')}
              </span>
              <button
                type="button"
                onClick={applyGlobalCommercialsToAllChannels}
                style={styles.smallSyncBtn}
              >
                Apply to all channels
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🔁 RE-ADDED: Global Defaults & Optimization Settings (side-by-side) */}
      <div style={enhancedStyles.sideBySideContainer}>
        {/* Global Defaults Section */}
        <div style={enhancedStyles.halfWidthSection}>
          <h3 style={enhancedStyles.sectionTitle}>Global Defaults</h3>
          <div style={enhancedStyles.inputGroup}>
            <div style={enhancedStyles.overrideInputRow}>
              <label style={enhancedStyles.overrideLabel}>Prime Time % (global default):</label>
              <input
                type="number"
                value={primePct}
                onChange={e => setPrimePct(parseFloat(e.target.value))}
                style={styles.numberInput}
              />
              <span style={styles.percentSymbol}>%</span>
            </div>
            <div style={enhancedStyles.overrideInputRow}>
              <label style={enhancedStyles.overrideLabel}>Non-Prime Time % (global default):</label>
              <input
                type="number"
                value={nonPrimePct}
                onChange={e => setNonPrimePct(parseFloat(e.target.value))}
                style={styles.numberInput}
              />
              <span style={styles.percentSymbol}>%</span>
            </div>
          </div>
        </div>

        {/* Optimization Settings Section */}
        <div style={enhancedStyles.halfWidthSection}>
          <h3 style={enhancedStyles.sectionTitle}>Optimization Settings</h3>
          <div style={enhancedStyles.inputGroup}>
            <div style={enhancedStyles.overrideInputRow}>
              <label style={enhancedStyles.overrideLabel}>Max Spot Bound (Override):</label>
              <input
                type="number"
                min="1"
                value={maxSpots}
                onChange={e => setMaxSpots(parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </div>
            <div style={enhancedStyles.overrideInputRow}>
              <label style={enhancedStyles.overrideLabel}>Optimization Time Limit (seconds):</label>
              <input
                type="number"
                min="10"
                value={timeLimit}
                onChange={e => setTimeLimit(parseInt(e.target.value))}
                style={styles.numberInput}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 🔁 RE-ADDED: Override Budget percentage per Commercial */}
      {Number(optimizationInput?.numCommercials) > 1 && (
        <div style={enhancedStyles.sectionContainer}>
          <h3 style={enhancedStyles.sectionTitle}>Override Budget percentage per Commercial</h3>
          <div style={enhancedStyles.commercialGrid}>
            {budgetProportions.map((val, idx) => (
              <div key={idx} style={enhancedStyles.commercialInput}>
                <label style={{ ...styles.label, minWidth: '110px' }}>Commercial {idx + 1}:</label>
                <input
                  type="number"
                  value={val}
                  onChange={e => handleBudgetProportionChange(idx, e.target.value)}
                  style={{ ...styles.numberInput, width: '80px' }}
                />
                <span style={styles.percentSymbol}>%</span>
              </div>
            ))}
          </div>
          <p style={enhancedStyles.totalHint}>
            Total must be 100% — Current:{' '}
            {budgetProportions
              .reduce((a, b) => a + (isNaN(parseFloat(b)) ? 0 : parseFloat(b)), 0)
              .toFixed(2)}%
          </p>
        </div>
      )}

      {/* Property Programs Editor (targets use On cost) */}
      {anyPropertyOn && (
        <PropertyProgramsEditor
          channels={channels}
          hasProperty={hasProperty}
          propertyAmounts={Object.fromEntries(
            channels.map(ch => {
              const propTotal = Number(propertyAmounts[ch] || 0);
              const { onCostPct } = propertyPercents[ch] || { onCostPct: 20 };
              return [ch, (propTotal * onCostPct) / 100];
            })
          )}
          propertyPrograms={propertyPrograms}
          setPropertyPrograms={setPropertyPrograms}
          toNumber={toNumber}
          formatLKR={formatLKR}
          styles={styles}
        />
      )}

      {/* Buttons */}
      <div style={styles.buttonRow}>
        {!isProcessing ? (
          <>
            <button onClick={onBack} style={styles.backButton}>Go Back</button>
            <button
              onClick={handleStartOptimization}
              style={{ ...styles.primaryButton, opacity: disableOptimize ? 0.7 : 1 }}
              disabled={disableOptimize}
            >
              Start Optimization
            </button>
          </>
        ) : (
          <>
            <p style={styles.processingMsg}>
              Optimization is processing. Please wait...
              {typeof countdown === 'number' && (
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4
                  }}
                >
                  {formatMMSS(Math.max(0, countdown))}
                </span>
              )}
            </p>
            <button onClick={onStop} style={styles.stopButton}>Stop Optimization</button>
          </>
        )}
      </div>
    </>
  );
}
