import React, { useEffect, useState } from 'react';

const toNumber = v => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

const SPECIAL_CHANNELS = [
  "SHAKTHI TV",
  "SHAKTHI NEWS",
  "SIRASA TV",
  "SIRASA NEWS",
];

// --- NEW CONSTANTS FOR CARGILLS LOGIC ---
const CARGILLS_CHANNEL = "DERANA TV";
const CARGILLS_CLIENT = "Cargills";
const OTHER_CLIENT = "Other";
const CLIENT_OPTIONS = [
  { key: CARGILLS_CLIENT, label: CARGILLS_CLIENT },
  { key: OTHER_CLIENT, label: OTHER_CLIENT }
];
// ----------------------------------------


    function NegotiatedRates({
      onBack,
      onProceed,
      initialChannelDiscounts,
      initialNegotiatedRates,
      initialTG,
      selectedChannels,
      initialClient,
      selectedClient: selectedClientProp,
    })

{
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [programs, setPrograms] = useState([]); // rows for the selected channel (must include id)
  const [channelDiscounts, setChannelDiscounts] = useState({});
  const [negotiatedRates, setNegotiatedRates] = useState({});
  const [manualOverride, setManualOverride] = useState({}); // { [id]: true } if user edited that row
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [selectedClient, setSelectedClient] = useState(selectedClientProp || initialClient || OTHER_CLIENT);


  const TG_OPTIONS = [
    { key: "tvr_all",              label: "All TG" },
    { key: "tvr_abc_15_90",        label: "SEC ABC | Age 15-90" },
    { key: "tvr_abc_30_60",        label: "SEC ABC | Age 30-60" },
    { key: "tvr_abc_15_30",        label: "SEC ABC | Age 15-30" },
    { key: "tvr_abc_20_plus",      label: "SEC ABC | Age 20+" },
    { key: "tvr_ab_15_plus",       label: "SEC AB | Age 15+" },
    { key: "tvr_cd_15_plus",       label: "SEC CD | Age 15+" },
    { key: "tvr_ab_female_15_45",  label: "SEC AB | Female Age 15-45" },
    { key: "tvr_abc_15_60",        label: "SEC ABC | Age 15-60" },
    { key: "tvr_bcde_15_plus",     label: "SEC BCDE | Age 15+" },
    { key: "tvr_abcde_15_plus",    label: "SEC ABCDE | Age 15+" },
    { key: "tvr_abc_female_15_60", label: "SEC ABC | Female Age 15-60" },
    { key: "tvr_abc_male_15_60",   label: "SEC ABC | Male Age 15-60" },
  ];

  const [selectedTG, setSelectedTG] = useState(initialTG || "tvr_all");


  // Helper function to determine if a channel discount is locked (readOnly)
  const isDiscountLocked = (channel, client) => {
    // Lock for existing special channels
    if (SPECIAL_CHANNELS.includes(channel)) return true;
    
    // Lock for Cargills special rate on DERANA TV
    if (channel === CARGILLS_CHANNEL && client === CARGILLS_CLIENT) return true;
    
    return false;
  };

  // --- Load channels & seed discounts ---
  useEffect(() => {
    if (!selectedChannels || selectedChannels.length === 0) return;

    setChannels(selectedChannels);
    setLoadingChannels(false);

    const base = {};
    selectedChannels.forEach(ch => {
      // Cargills logic applies only when loading programs, not for initial discount seeding
      if (SPECIAL_CHANNELS.includes(ch)) {
        base[ch] = 0; // special channels: default discount = 0
      } else {
        base[ch] = initialChannelDiscounts?.[ch] ?? 30;
      }
    });
    setChannelDiscounts(base);

    // Select the first channel by default
    setSelectedChannel(selectedChannels[0]);
  }, [selectedChannels, initialChannelDiscounts]);

  // Restore negotiated rates if coming back
  useEffect(() => {
    if (initialNegotiatedRates) {
      setNegotiatedRates(initialNegotiatedRates);
    }
  }, [initialNegotiatedRates]);


  // --- Logic to re-load programs when channel, TG, OR client changes ---
// --- Logic to re-load programs when channel, TG, OR client changes ---
useEffect(() => {
  if (!selectedChannel) return;
  setLoadingPrograms(true);

  // Determine the base state for the current selection
  const isSpecialChannel = SPECIAL_CHANNELS.includes(selectedChannel);
  const isCargillsDerana = selectedChannel === CARGILLS_CHANNEL && selectedClient === CARGILLS_CLIENT;
  const isChannelLocked = isSpecialChannel || isCargillsDerana;

  // Set the discount to 0% if the channel is locked
  if (isChannelLocked && channelDiscounts[selectedChannel] !== 0) {
    setChannelDiscounts(prev => ({
      ...prev,
      [selectedChannel]: 0,
    }));
  }

  fetch(`https://optwebapp-production-60b4.up.railway.app/programs?channel=${encodeURIComponent(selectedChannel)}`)
    .then(res => res.json())
    .then(data => {
      const rows = (data.programs || []).map(p => {
        const tvrValue = toNumber(p[selectedTG] ?? 0);
        const dbNet = isSpecialChannel ? toNumber(p.net_cost) : null;
        const cargillsRate = isCargillsDerana ? toNumber(p.cargills_rate) : null;

        return {
          id: p.id,
          day: p.day,
          time: p.time,
          program: p.program,
          cost: toNumber(p.cost),
          cargillsRate: cargillsRate,
          tvr: tvrValue,
          slot: p.slot,
          channel: selectedChannel,
          dbNet,
          isSpecial: isSpecialChannel || isCargillsDerana,
        };
      });

      setPrograms(rows);

      // Seed negotiated rates - FIXED LOGIC
      setNegotiatedRates(prev => {
        const next = { ...prev };

        rows.forEach(r => {
          const existing = initialNegotiatedRates?.[r.id] ?? prev[r.id];

          // If we have an existing value AND it's manually overridden, keep it
          if (existing != null && manualOverride[r.id]) {
            next[r.id] = existing;
          }
          // Otherwise, calculate based on channel type
          else if (isCargillsDerana) {
            // NEW: Use cargills_rate for Cargills on Derana TV
            const baseRate = r.cargillsRate && !Number.isNaN(r.cargillsRate) ? r.cargillsRate : r.cost;
            next[r.id] = baseRate;
          } else if (isSpecialChannel) {
            // For existing special channels, use DB net_cost
            const baseNet = r.dbNet && !Number.isNaN(r.dbNet) ? r.dbNet : r.cost;
            next[r.id] = baseNet;
          } else {
            // Normal channels → discounted cost
            const discPct = toNumber(channelDiscounts[selectedChannel] ?? 30);
            const disc = discPct / 100;
            next[r.id] = +(r.cost * (1 - disc)).toFixed(2);
          }
        });

        return next;
      });
    })
    .finally(() => setLoadingPrograms(false));
}, [selectedChannel, selectedTG, selectedClient, initialNegotiatedRates]); // Added initialNegotiatedRates dependency

  // --- Recompute negotiated rates when discount for selected channel changes (non-special only) ---
  useEffect(() => {
    if (!selectedChannel || programs.length === 0) return;

    const isChannelLocked = isDiscountLocked(selectedChannel, selectedClient);

    setNegotiatedRates(prev => {
      const next = { ...prev };

      if (isChannelLocked) {
        // For locked channels (including Cargills/Derana), discount changes don't affect rates 
        // unless they are manually overridden. If not overridden, reset to the special rate.
        programs.forEach(r => {
          if (!manualOverride[r.id]) {
            let baseRate = r.cost; // Default fallback

            if (selectedChannel === CARGILLS_CHANNEL && selectedClient === CARGILLS_CLIENT) {
                // Cargills/Derana: use the special rate
                baseRate = r.cargillsRate && !Number.isNaN(r.cargillsRate) ? r.cargillsRate : r.cost;
            } else if (SPECIAL_CHANNELS.includes(selectedChannel)) {
                // Existing special channels: use DB net_cost
                baseRate = r.dbNet && !Number.isNaN(r.dbNet) ? r.dbNet : r.cost;
            }
            next[r.id] = baseRate;
          }
        });
        return next;
      }

      // Normal channels: apply discount to non-overridden rows
      const discPct = toNumber(channelDiscounts[selectedChannel] ?? 30);
      const disc = discPct / 100;

      programs.forEach(r => {
        if (!manualOverride[r.id]) {
          next[r.id] = +(r.cost * (1 - disc)).toFixed(2);
        }
      });

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelDiscounts[selectedChannel], selectedClient]);

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

  const handleClientChange = e => {
      const newClient = e.target.value;
      setSelectedClient(newClient);
      
      // If the new client selection locks the discount, enforce 0%
      if (isDiscountLocked(selectedChannel, newClient) && channelDiscounts[selectedChannel] !== 0) {
        setChannelDiscounts(prev => ({
            ...prev,
            [selectedChannel]: 0,
        }));
      }
      
      // The main useEffect (watching selectedClient) will handle program rate recomputation.
  }


  const resetRowToDiscount = (row) => {
    const isCargillsDerana = row.channel === CARGILLS_CHANNEL && selectedClient === CARGILLS_CLIENT;

    setNegotiatedRates(prev => {
      const next = { ...prev };

      if (isCargillsDerana) {
          // Reset to Cargills rate
          const baseRate = row.cargillsRate && !Number.isNaN(row.cargillsRate) ? row.cargillsRate : row.cost;
          next[row.id] = baseRate;
      } else if (SPECIAL_CHANNELS.includes(row.channel)) {
        // Reset to DB net_cost (or cost) for existing special channels
        const baseNet = row.dbNet && !Number.isNaN(row.dbNet) ? row.dbNet : row.cost;
        next[row.id] = baseNet;
      } else {
        const discPct = toNumber(channelDiscounts[row.channel] ?? 30);
        const disc = discPct / 100;
        const calc = +(row.cost * (1 - disc)).toFixed(2);
        next[row.id] = calc;
      }

      return next;
    });

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

  // Check if the current channel discount input should be disabled
  const isCurrentDiscountLocked = isDiscountLocked(selectedChannel, selectedClient);

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
        
        {/* --- NEW CLIENT DROPDOWN --- */}
        <label style={styles.label}>Client:</label>
        <select
            id="client-select"
            value={selectedClient}
            onChange={handleClientChange}
            style={styles.select}
        >
            {CLIENT_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
            ))}
        </select>
        {/* --------------------------- */}

        <label style={styles.label}>Target Group:</label>
        <select
          value={selectedTG}
          onChange={(e) => setSelectedTG(e.target.value)}
          style={styles.select}
        >
          {TG_OPTIONS.map(tg => (
            <option key={tg.key} value={tg.key}>
              {tg.label}
            </option>
          ))}
        </select>

        <label style={{ ...styles.label, marginLeft: 8 }}>Discount %:</label>
        <input
          type="number"
          min="0"
          value={channelDiscounts[selectedChannel] ?? 30}
          onChange={handleDiscountChange}
          readOnly={isCurrentDiscountLocked}   // 🔒 Apply lock logic
          style={{
            ...styles.input,
            cursor: isCurrentDiscountLocked ? "not-allowed" : "text",
            backgroundColor: isCurrentDiscountLocked ? "#f0f4f7" : "white", // Visual feedback for locked
          }}
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
          {isCurrentDiscountLocked && (
             <span style={{ 
                color: selectedChannel === CARGILLS_CHANNEL ? '#9b2c2c' : '#2c5282', 
                backgroundColor: selectedChannel === CARGILLS_CHANNEL ? '#fed7d7' : '#ebf8ff', 
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600'
             }}>
                {selectedChannel === CARGILLS_CHANNEL ? 'Cargills Negotiated Rate' : 'Special Channel Rate'}
             </span>
          )}
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
                  <td style={{ ...styles.td, ...styles.right }}>
                    {p.tvr?.toFixed?.(2) ?? toNumber(p.tvr).toFixed(2)}
                  </td>
                  <td style={{ ...styles.td, ...styles.center }}>{p.slot}</td>
                  <td style={{ ...styles.td, ...styles.right }}>
                    <input
                      type="number"
                      value={negotiatedRates[p.id] ?? 0}
                      onChange={e => handleNegotiatedRateChange(p.id, e.target.value)}
                      style={styles.inputCell}
                    />
                  </td>
                  <td style={{ ...styles.td, ...styles.center }}>
                    <button
                      type="button"
                      style={styles.smallButton}
                      onClick={() => resetRowToDiscount(p)}
                    >
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
          onClick={() => onProceed({ channelDiscounts, negotiatedRates, selectedTG, selectedClient })} // 👈 PASS selectedClient
          style={styles.primaryButton}
        >
          Proceed
        </button>
      </div>
    </div>
  );
}

export default NegotiatedRates;