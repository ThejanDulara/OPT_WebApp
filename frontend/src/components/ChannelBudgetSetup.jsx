// ChannelBudgetSetup.jsx
import React from 'react';

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
  // derived
  totalBudget, enteredPctTotal, totalProperty, totalAvailable, channelMoney,
  // helpers
  toNumber, formatLKR, applyGlobalToAllChannels,
  // actions
  onBack, onSubmit, onStop, isProcessing,
  // styles
  styles
}) {
  const handleInputChange = (channel, value) => {
    setBudgetShares(prev => ({ ...prev, [channel]: toNumber(value) }));
  };

  return (
    <>
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
            💡 Total must be 100% — Current: {budgetProportions.reduce((a, b) => a + (isNaN(parseFloat(b)) ? 0 : parseFloat(b)), 0).toFixed(2)}%
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
            <button onClick={onSubmit} style={styles.primaryButton}>Re-Optimize by Budget Share →</button>
          </>
        ) : (
          <>
            <p style={styles.processingMsg}>🕒 Optimization is processing. Please wait...</p>
            <button onClick={onStop} style={styles.stopButton}>⛔ Stop Optimization</button>
          </>
        )}
      </div>
    </>
  );
}
