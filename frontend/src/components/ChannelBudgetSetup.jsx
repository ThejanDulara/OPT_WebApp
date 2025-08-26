// ChannelBudgetSetup.jsx
import React, { useEffect, useState } from 'react';
import PropertyProgramsEditor from './PropertyProgramsEditor';

export default function ChannelBudgetSetup({
  channels,
  optimizationInput,
  // state + setters / handlers
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
  // validation coming from parent
  propertyValidation, // { ok: boolean, perChannel?: { [channel]: {target:number, sum:number} } }
  // styles
  styles
}) {
  const handleInputChange = (channel, value) => {
    setBudgetShares(prev => ({ ...prev, [channel]: toNumber(value) }));
  };

    // add near the top of the component body
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

  // Function to get channel logo path
  const getLogoPath = (channel) => `/logos/${channel}.png`;

  // New styles for the improved layout
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
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
      width: '100%',
      maxWidth: '555px' // Matches one channel card width
    },
    summaryRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    summaryLabel: {
      fontWeight: 'bold',
      color: '#2d3748'
    },
    summaryValue: {
      fontWeight: 'bold',
      color: '#2d3748'
    },
      // New styles for the sections you mentioned
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

  return (
    <>
      {/* Channel rows - Two channels per row */}
      <div style={{ marginBottom: '20px' }}>
        {channelRows.map((row, rowIndex) => (
          <div key={rowIndex} style={enhancedStyles.channelRow}>
            {row.map((ch, idx) => {
              const chAmount = channelMoney[ch]?.chAmount || 0;
              const prop = channelMoney[ch]?.prop || 0;
              const available = channelMoney[ch]?.available || 0;

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
                    <input
                      type="number"
                      step="0.01"
                      value={budgetShares[ch] ?? ''}
                      onChange={e => handleInputChange(ch, e.target.value)}
                      style={{ ...styles.numberInput, width: '70px' }}
                      min="0"
                      max="100"
                    />
                    <span style={styles.percentSymbol}>%</span>
                  </div>

                  {/* Property amount input */}
                  {hasProperty[ch] && (
                    <div style={enhancedStyles.inputRow}>
                      <label style={{ ...styles.label, minWidth: '100px' }}>Property Amount:</label>
                      <input
                        type="number"
                        step="0.01"
                        value={propertyAmounts[ch] ?? 0}
                        onChange={e => handlePropertyAmount(ch, e.target.value)}
                        style={{ ...styles.numberInput, width: '120px' }}
                        min="0"
                      />
                      <span>LKR</span>
                    </div>
                  )}

                  {/* Calculated amounts */}
                  <div style={enhancedStyles.amountRow}>
                    <div style={enhancedStyles.amountBox}>
                      <strong>Channel Budget:</strong> {formatLKR(chAmount)}
                    </div>
                    <div style={enhancedStyles.amountBox}>
                      <strong>Property:</strong> {formatLKR(prop)}
                    </div>
                    <div style={enhancedStyles.amountBox}>
                      <strong>Available:</strong> {formatLKR(available)}
                    </div>
                  </div>

                  {/* PT/NPT split editor */}
                  <div style={enhancedStyles.splitContainer}>
                    <div style={enhancedStyles.inputRow}>
                      <span style={{ ...styles.label, minWidth: '80px' }}>Prime Time:</span>
                      <input
                        type="number"
                        step="0.01"
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
                        step="0.01"
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
                </div>
              );
            })}

            {/* Add empty div to maintain layout for odd-numbered rows */}
            {row.length === 1 && (
              <div style={{ ...enhancedStyles.channelCard, visibility: 'hidden', height: 0, padding: 16, border: 'none' }}></div>
            )}
          </div>
        ))}
      </div>

      {/* Summary box moved to after channels */}
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
          <span style={enhancedStyles.summaryLabel}>Optimizable Total (excl. Property):</span>
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
      </div>

    {/* Global Defaults and Optimization Settings side by side */}
    <div style={enhancedStyles.sideBySideContainer}>
      {/* Global Defaults Section */}
      <div style={enhancedStyles.halfWidthSection}>
        <h3 style={enhancedStyles.sectionTitle}>Global Defaults</h3>
        <div style={enhancedStyles.inputGroup}>
          <div style={enhancedStyles.overrideInputRow}>
            <label style={enhancedStyles.overrideLabel}>Prime Time % (global default):</label>
            <input
              type="number"
              step="0.01"
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
              step="0.01"
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

    {/* Commercial Overrides (full width below) */}
    {optimizationInput.numCommercials > 1 && (
      <div style={enhancedStyles.sectionContainer}>
        <h3 style={enhancedStyles.sectionTitle}>Override Budget percentage per Commercial</h3>
        <div style={enhancedStyles.commercialGrid}>
          {budgetProportions.map((val, idx) => (
            <div key={idx} style={enhancedStyles.commercialInput}>
              <label style={{ ...styles.label, minWidth: '110px' }}>Commercial {idx + 1}:</label>
              <input
                type="number"
                step="0.01"
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
          {budgetProportions.reduce((a, b) => a + (isNaN(parseFloat(b)) ? 0 : parseFloat(b)), 0).toFixed(2)}%
        </p>
      </div>
    )}

      {/* Property programs editor (appears if any channel has property) */}
      {anyPropertyOn && (
        <>
          {/* This component enforces: sum(Budget) per channel == Property (LKR) for that channel */}
          <PropertyProgramsEditor
            channels={channels}
            hasProperty={hasProperty}
            propertyAmounts={propertyAmounts}
            propertyPrograms={propertyPrograms}
            setPropertyPrograms={setPropertyPrograms}
            toNumber={toNumber}
            formatLKR={formatLKR}
            styles={styles}
          />
        </>
      )}

      {/* Buttons */}
      <div style={styles.buttonRow}>
        {!isProcessing ? (
          <>
            <button onClick={onBack} style={styles.backButton}>Go Back</button>
            <button onClick={onSubmit} style={{ ...styles.primaryButton, opacity: disableOptimize ? 0.7 : 1 }} disabled={disableOptimize}>
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
                        background: '#edf2f7',
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