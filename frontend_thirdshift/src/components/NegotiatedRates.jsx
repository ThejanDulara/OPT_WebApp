// NegotiatedRates.jsx
import React, { useEffect, useMemo, useState } from 'react';

/**
 * Props:
 * - onBack: () => void
 * - onProceed: (payload: {
 *     channelDiscounts: { [channel: string]: number },
 *     negotiatedRates: { [programId: number]: number }
 *   }) => void
 * - initialChannelDiscounts?: { [channel: string]: number }   // optional restore
 * - initialNegotiatedRates?: { [programId: number]: number }  // optional restore
 *
 * Notes:
 * - Default discount for every channel = 30%
 * - We fetch channels from /channels
 * - We fetch programs for a channel from /programs?channel=<name>  (this returns id)
 * - For each row: Negotiated Rate = Cost * (1 - discount/100), unless user manually overrides
 * - Manual overrides are kept in negotiatedRates[id]; changing channel discount will only
 *   re-calc rows that are NOT overridden.
 */

const toNumber = v => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

function NegotiatedRates({
  onBack,
  onProceed,
  initialChannelDiscounts,
  initialNegotiatedRates,
}) {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [programs, setPrograms] = useState([]); // rows for the selected channel (must include id)
  const [channelDiscounts, setChannelDiscounts] = useState({});
  const [negotiatedRates, setNegotiatedRates] = useState({});
  const [manualOverride, setManualOverride] = useState({}); // { [id]: true } if user edited that row
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // --- Load channels
  useEffect(() => {
    fetch('https://optwebapp-production.up.railway.app/channels')
      .then(res => res.json())
      .then(data => {
        const list = data.channels || [];
        setChannels(list);

        // seed default 30% for all channels (or restore if provided)
        const base = {};
        list.forEach(ch => {
          base[ch] = initialChannelDiscounts?.[ch] ?? 30;
        });
        setChannelDiscounts(base);

        // Select first channel by default
        if (list.length > 0) setSelectedChannel(list[0]);
      })
      .finally(() => setLoadingChannels(false));
  }, []); // eslint-disable-line

  // --- Load programs when channel changes (use query param endpoint to get `id`)
  useEffect(() => {
    if (!selectedChannel) return;
    setLoadingPrograms(true);

    fetch(`https://optwebapp-production.up.railway.app/programs?channel=${encodeURIComponent(selectedChannel)}`)
      .then(res => res.json())
      .then(data => {
        const rows = (data.programs || []).map(p => ({
          id: p.id,                 // must come from this endpoint
          day: p.day,
          time: p.time,
          program: p.program,
          cost: toNumber(p.cost),
          tvr: toNumber(p.tvr),
          slot: p.slot,
          channel: selectedChannel,
        }));

        setPrograms(rows);

        // Seed negotiated rates for any missing ids (respect existing overrides and restores)
        setNegotiatedRates(prev => {
          const next = { ...prev };
          const disc = toNumber(channelDiscounts[selectedChannel] ?? 30) / 100;
          rows.forEach(r => {
            const existing = (initialNegotiatedRates && initialNegotiatedRates[r.id] != null)
              ? initialNegotiatedRates[r.id]
              : next[r.id];
            if (existing == null && !manualOverride[r.id]) {
              next[r.id] = +(r.cost * (1 - disc)).toFixed(2);
            }
          });
          return next;
        });
      })
      .finally(() => setLoadingPrograms(false));
  }, [selectedChannel]); // eslint-disable-line

  // --- When the discount for the selected channel changes, recompute non-overridden rows
  useEffect(() => {
    if (!selectedChannel || programs.length === 0) return;
    const discPct = toNumber(channelDiscounts[selectedChannel] ?? 30);
    const disc = discPct / 100;

    setNegotiatedRates(prev => {
      const next = { ...prev };
      programs.forEach(r => {
        if (!manualOverride[r.id]) {
          next[r.id] = +(r.cost * (1 - disc)).toFixed(2);
        }
      });
      return next;
    });
    // eslint-disable-next-line
  }, [channelDiscounts[selectedChannel]]);

  const handleChannelSelect = e => {
    setSelectedChannel(e.target.value);
  };

  const handleDiscountChange = e => {
    const val = toNumber(e.target.value);
    setChannelDiscounts(prev => ({
      ...prev,
      [selectedChannel]: val,
    }));
  };

  const handleNegotiatedRateChange = (id, value) => {
    const num = toNumber(value);
    setNegotiatedRates(prev => ({ ...prev, [id]: num }));
    setManualOverride(prev => ({ ...prev, [id]: true }));
  };

  const resetRowToDiscount = (row) => {
    const discPct = toNumber(channelDiscounts[row.channel] ?? 30);
    const disc = discPct / 100;
    const calc = +(row.cost * (1 - disc)).toFixed(2);
    setNegotiatedRates(prev => ({ ...prev, [row.id]: calc }));
    setManualOverride(prev => {
      const copy = { ...prev };
      delete copy[row.id];
      return copy;
    });
  };

  const formatLKR = n =>
    `${Number(n || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;

  const styles = {
    form: {
      padding: '32px',
      maxWidth: '1400px',
      margin: '0 auto',
      backgroundColor: '#d5e9f7',
      borderRadius: '12px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
    },
    title: {
      color: '#2d3748',
      fontSize: '24px',
      fontWeight: '600',
      marginBottom: '32px',
      paddingBottom: '16px',
      borderBottom: '1px solid #e2e8f0',
    },
    topBar: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: '16px',
    },
    label: { color: '#4a5568', fontWeight: '500' },
    select: {
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #e2e8f0',
      backgroundColor: 'white',
      fontSize: '14px',
      minWidth: '200px',
    },
    input: {
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #e2e8f0',
      fontSize: '14px',
      minWidth: '120px',
      textAlign: 'right',
    },
    tableContainer: {
      overflowX: 'auto',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      backgroundColor: 'white',
      marginTop: '12px',
    },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '16px' },
    th: {
      padding: '12px 16px',
      textAlign: 'center',
      backgroundColor: '#f7fafc',
      color: '#4a5568',
      fontWeight: '600',
      borderBottom: '1px solid #e2e8f0',
      whiteSpace: 'nowrap',
    },
    td: { padding: '12px 16px', color: '#4a5568', borderBottom: '1px solid #e2e8f0' },
    right: { textAlign: 'right' },
    center: { textAlign: 'center' },
    inputCell: {
      width: '100%',
      padding: '8px',
      border: '1px solid #e2e8f0',
      borderRadius: '4px',
      fontSize: '14px',
      textAlign: 'right',
    },
    smallButton: {
      padding: '6px 10px',
      backgroundColor: '#edf2f7',
      color: '#4a5568',
      border: '1px solid #cbd5e0',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: '500',
    },
    buttonRow: { display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' },
    backButton: {
      padding: '10px 20px',
      backgroundColor: '#edf2f7',
      color: '#2d3748',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    },
    primaryButton: {
      padding: '10px 20px',
      backgroundColor: '#4299e1',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
    },
  };

  const getLogoPath = (channel) => `/logos/${channel}.png`;

  return (
    <div style={styles.form}>
      <h2 style={styles.title}>Set Negotiated Rates (Per Channel Discounts)</h2>

      {/* Channel picker + discount */}
      <div style={styles.topBar}>
        <label style={styles.label}>Channel:</label>
        <select
          value={selectedChannel}
          onChange={handleChannelSelect}
          style={styles.select}
          disabled={loadingChannels}
        >
          {channels.map((c, i) => (
            <option key={i} value={c}>{c}</option>
          ))}
        </select>

        <label style={{ ...styles.label, marginLeft: 8 }}>Discount %:</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={channelDiscounts[selectedChannel] ?? 30}
          onChange={handleDiscountChange}
          style={styles.input}
        />
      </div>

      {/* Channel header with logo */}
      {selectedChannel && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '4px',
          marginBottom: '8px',
        }}>
          <img
            src={getLogoPath(selectedChannel)}
            alt={selectedChannel}
            style={{ height: 40, width: 'auto', objectFit: 'contain', borderRadius: 4 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <h3 style={{ margin: 0, color: '#1a202c', fontSize: 20, fontWeight: 600 }}>
            Programs for {selectedChannel}
          </h3>
        </div>
      )}

      {/* Table */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Day</th>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Program</th>
              <th style={styles.th}>Rate (30 Sec)</th>
              <th style={styles.th}>TVR</th>
              <th style={styles.th}>Slot ([A]PT/[B]NPT)</th>
              <th style={styles.th}>Negotiated Rate</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loadingPrograms ? (
              <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center' }}>Loading programs…</td></tr>
            ) : programs.length === 0 ? (
              <tr><td colSpan={8} style={{ ...styles.td, textAlign: 'center', color: '#718096' }}>No programs.</td></tr>
            ) : (
              programs.map((p, idx) => (
                <tr key={p.id ?? idx}>
                  <td style={styles.td}>{p.day}</td>
                  <td style={styles.td}>{p.time}</td>
                  <td style={styles.td}>{p.program}</td>
                  <td style={{ ...styles.td, ...styles.right }}>{formatLKR(p.cost)}</td>
                  <td style={{ ...styles.td, ...styles.right }}>{p.tvr?.toFixed?.(2) ?? toNumber(p.tvr).toFixed(2)}</td>
                  <td style={{ ...styles.td, ...styles.center }}>{p.slot}</td>
                  <td style={{ ...styles.td, ...styles.right }}>
                    <input
                      type="number"
                      step="0.01"
                      value={negotiatedRates[p.id] ?? 0}
                      onChange={e => handleNegotiatedRateChange(p.id, e.target.value)}
                      style={styles.inputCell}
                    />
                  </td>
                  <td style={{ ...styles.td, ...styles.center }}>
                    <button type="button" style={styles.smallButton} onClick={() => resetRowToDiscount(p)}>
                      Reset
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Buttons */}
      <div style={styles.buttonRow}>
        <button onClick={onBack} style={styles.backButton}>Back</button>
        <button
          onClick={() => onProceed({ channelDiscounts, negotiatedRates })}
          style={styles.primaryButton}
        >
          Proceed
        </button>
      </div>
    </div>
  );
}

export default NegotiatedRates;
