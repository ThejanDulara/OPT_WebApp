import React, { useEffect, useState, useMemo } from 'react';

const SPECIAL_CHANNELS = [
  "SHAKTHI TV",
  "SHAKTHI NEWS",
  "SIRASA TV",
  "SIRASA NEWS",
];

function ProgramUpdater({ onBack }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('DERANA TV');
  const [programs, setPrograms] = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [isAddingChannel, setIsAddingChannel] = useState(false);

  // New State for Search and Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [slotFilter, setSlotFilter] = useState('');

  // New State for Saving Status
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('https://optwebapp-production.up.railway.app/channels')
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels || []);
        if (data.channels.includes('DERANA TV')) {
          fetch(`https://optwebapp-production.up.railway.app/programs?channel=DERANA TV`)
            .then(res => res.json())
            .then(data => setPrograms(data.programs || []));
        }
      });
  }, []);

  const handleChannelSelect = (e) => {
    const channel = e.target.value;
    setSelectedChannel(channel);
    setSearchTerm('');
    setSlotFilter('');
    fetch(`https://optwebapp-production.up.railway.app/programs?channel=${channel}`)
      .then(res => res.json())
      .then(data => setPrograms(data.programs || []));
  };

  // --- UPDATED INPUT HANDLER WITH SLOT RESTRICTION ---
  const handleProgramChange = (originalIndex, field, value) => {
    let finalValue = value;

    // Logic specifically for the 'slot' column
    if (field === 'slot') {
      // 1. Force Uppercase
      finalValue = value.toUpperCase();

      // 2. Validate Pattern
      // Regex explanation: ^(A[1-5]?|B)?$
      // - Allows empty string (for deleting)
      // - Allows 'B'
      // - Allows 'A'
      // - Allows 'A' followed by '1' through '5'
      // - Blocks anything else (like 'C', 'A6', 'AB', etc.)
      const isValid = /^(A[1-5]?|B)?$/.test(finalValue);

      if (!isValid) return; // Stop here if invalid (don't update state)
    }

    const updated = [...programs];
    updated[originalIndex][field] = finalValue;
    setPrograms(updated);
  };

  const addNewProgram = () => {
    setSearchTerm('');
    setSlotFilter('');
    setPrograms([
      ...programs,
      {
        day: '', time: '', program: '', cost: 0, net_cost: 0, cargills_rate: 0, slot: '',
        tvr_all: 0, tvr_abc_15_90: 0, tvr_abc_30_60: 0, tvr_abc_15_30: 0,
        tvr_abc_20_plus: 0, tvr_ab_15_plus: 0, tvr_cd_15_plus: 0,
        tvr_ab_female_15_45: 0, tvr_abc_15_60: 0, tvr_bcde_15_plus: 0,
        tvr_abcde_15_plus: 0, tvr_abc_female_15_60: 0, tvr_abc_male_15_60: 0
      }
    ]);
  };

  const deleteProgram = (program, slot) => {
    if (!window.confirm(`Are you sure you want to delete "${program}" from slot "${slot}"?`)) return;

    fetch('https://optwebapp-production.up.railway.app/delete-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selectedChannel, program, slot })
    })
      .then(res => res.json())
      .then(() => {
        setPrograms(programs.filter(p => !(p.program === program && p.slot === slot)));
        alert('🗑️ Program deleted.');
      })
      .catch(() => alert('❌ Delete failed.'));
  };

  const saveChanges = () => {
    setIsSaving(true);

    fetch('https://optwebapp-production.up.railway.app/update-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selectedChannel, programs })
    })
      .then(res => res.json())
      .then(data => alert('✅ Programs updated successfully!'))
      .catch(() => alert('❌ Failed to update programs.'))
      .finally(() => {
        setIsSaving(false);
      });
  };

  const createChannel = () => {
    if (!newChannelName) return;
    fetch('https://optwebapp-production.up.railway.app/create-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName })
    })
      .then(res => res.json())
      .then(() => {
        setChannels([...channels, newChannelName]);
        setSelectedChannel(newChannelName);
        setNewChannelName('');
        setIsAddingChannel(false);
        setPrograms([]);
      });
  };

  const downloadAllProgramsExcel = () => {
    fetch('https://optwebapp-production.up.railway.app/export-all-programs')
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_programs.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(() => alert('❌ Failed to download Excel.'));
  };

  const getLogoPath = (channel) => `/logos/${channel}.png`;

  const uniqueSlots = useMemo(() => {
    const slots = programs.map(p => p.slot).filter(Boolean);
    return [...new Set(slots)].sort();
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    return programs
      .map((p, index) => ({ ...p, originalIndex: index }))
      .filter(p => {
        const matchesSearch =
          (p.program || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.day || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.time || '').toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSlot = slotFilter ? p.slot === slotFilter : true;

        return matchesSearch && matchesSlot;
      });
  }, [programs, searchTerm, slotFilter]);

    const formatTime12Hour = (time24) => {
      if (!time24) return '';
      const [h, m] = time24.split(':').map(Number);

      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;

      return `${hour12}.${m.toString().padStart(2, '0')} ${period}`;
    };

    const combineTimeRange = (start, end) => {
      if (!start && !end) return '';

      if (start && !end) {
        return formatTime12Hour(start);
      }

      if (!start && end) {
        return formatTime12Hour(end);
      }

      return `${formatTime12Hour(start)} – ${formatTime12Hour(end)}`;
    };


    const parseTime12To24 = (time12) => {
      if (!time12) return '';

      const cleaned = time12
        .trim()                       // remove leading/trailing spaces
        .replace(/\./g, ':')          // dot → colon
        .replace(/\s+/g, ' ');        // normalize spaces

      const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return '';

      let [, h, m, period] = match;
      h = parseInt(h, 10);
      m = parseInt(m, 10);
      period = period.toUpperCase();

      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;

      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    };

    const splitTimeRange = (range) => {
      if (!range) return { start: '', end: '' };

      const normalized = range
        .trim()
        .replace(/\s*-\s*/g, ' – ')
        .replace(/\s+/g, ' ');

      if (normalized.includes('–')) {
        const [start12, end12] = normalized.split('–').map(s => s.trim());
        return {
          start: parseTime12To24(start12),
          end: parseTime12To24(end12),
        };
      }

      return {
        start: parseTime12To24(normalized),
        end: '',
      };
    };




  const isSpecialChannel = SPECIAL_CHANNELS.includes(selectedChannel);
  const isDeranaTV = selectedChannel === "DERANA TV";

  return (
    <div style={styles.form}>
      <h2 style={styles.title}>Program Manager</h2>

      <div style={styles.channelSelector}>
        <label style={styles.label}>Select Channel:</label>
        <select
          value={selectedChannel}
          onChange={handleChannelSelect}
          style={styles.select}
        >
          <option value="">-- Select --</option>
          {channels.map((c, i) => (
            <option key={i} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setIsAddingChannel(true)}
          style={styles.addButton}
        >
          ➕ Add New Channel
        </button>

        <div style={styles.instructionBox}>
          <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc' }}>
            <li style={{ listStyleType: 'none', fontWeight: 'bold', marginBottom: '6px' }}>
              Note
            </li>
            <li>Always make sure to use the SRL Program name.</li>
            <li>If it is a new program, please edit the name once you get data from SRL.</li>
            <li>Please use the 24-hour clock format when updating the time column.</li>
          </ul>
        </div>

      </div>

      {isAddingChannel && (
        <div style={styles.addChannelContainer}>
          <input
            type="text"
            placeholder="New Channel Name"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            style={styles.input}
          />
          <button onClick={createChannel} style={styles.createButton}>
            Create
          </button>
        </div>
      )}

      {selectedChannel && (
        <div style={styles.channelCard}>
          <div style={styles.channelHeader}>
            <div style={styles.channelInfo}>
              <img
                src={getLogoPath(selectedChannel)}
                alt={selectedChannel}
                style={styles.channelLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <h3 style={styles.channelName}>Programs for {selectedChannel}</h3>
            </div>

            <div style={styles.infoColumn}>
                {/* General Slot Definition for ALL Channels */}
                <div style={styles.hiruNoteInline}>
                    Slot A - Prime time | Slot B - Non Prime time
                </div>

                {/* Specific Note for HIRU TV */}
                {selectedChannel === "HIRU TV" && (
                <div style={{...styles.hiruNoteInline, marginTop: '8px'}}>
                    <strong>HIRU TV Specifics:</strong> A1 (6.55 News) | A2 (9.55 News) | A3 (WD PT + 11.55 News) | A4 (WE PT) | A5 (PT B)
                </div>
                )}
            </div>
          </div>

          <div style={styles.filterBar}>
            <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Search:</label>
                <input
                    type="text"
                    placeholder="Search by Name, Day, Time..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={styles.searchInput}
                />
            </div>
            <div style={styles.filterGroup}>
                <label style={styles.filterLabel}>Filter Slot:</label>
                <select
                    value={slotFilter}
                    onChange={(e) => setSlotFilter(e.target.value)}
                    style={styles.filterSelect}
                >
                    <option value="">All Slots</option>
                    {uniqueSlots.map((slot, i) => (
                        <option key={i} value={slot}>{slot}</option>
                    ))}
                </select>
            </div>
            <div style={styles.recordCount}>
                Showing <strong>{filteredPrograms.length}</strong> of {programs.length} programs
            </div>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>#</th>
                <th style={{ ...styles.tableHeader, ...styles.columnWidths[0] }}>Day</th>
                <th style={styles.tableHeader}>Is WE</th>
                <th style={{ ...styles.tableHeader, ...styles.columnWidths[1] }}>Time</th>
                <th style={{ ...styles.tableHeader, ...styles.columnWidths[2] }}>Program</th>
                <th style={{ ...styles.tableHeader, ...styles.columnWidths[3] }}>Rate Card (30 Sec)</th>

                {/* Cargills Rate Column - Only for DERANA TV */}
                {isDeranaTV && (
                  <th style={{ ...styles.tableHeader, minWidth: '140px' }}>Cargills Rate (30 Sec)</th>
                )}

                {/* New Negotiated Rate Column */}
                <th style={{ ...styles.tableHeader, minWidth: '140px' }}>Neg. Rate (30 Sec)</th>
                <th style={styles.tableHeader}>Slot</th>
                <th style={styles.tableHeader}>TVR All</th>
                <th style={styles.tableHeader}>ABC 15–90</th>
                <th style={styles.tableHeader}>ABC 30–60</th>
                <th style={styles.tableHeader}>ABC 15–30</th>
                <th style={styles.tableHeader}>ABC 20+</th>
                <th style={styles.tableHeader}>AB 15+</th>
                <th style={styles.tableHeader}>CD 15+</th>
                <th style={styles.tableHeader}>AB Female 15–45</th>
                <th style={styles.tableHeader}>ABC 15–60</th>
                <th style={styles.tableHeader}>BCDE 15+</th>
                <th style={styles.tableHeader}>ABCDE 15+</th>
                <th style={styles.tableHeader}>ABC Female 15–60</th>
                <th style={styles.tableHeader}>ABC Male 15–60</th>
                <th style={styles.tableHeader}>Delete</th>
              </tr>
            </thead>
              <tbody>
                {filteredPrograms.map((p, idx) => (
                <tr key={p.originalIndex} style={styles.tableRow}>
                  <td style={styles.centerAlignedCell}><strong>{idx + 1}</strong></td>

                  <td style={styles.tableCell}>
                    <input type="text" value={p.day || ''} onChange={(e) => handleProgramChange(p.originalIndex, 'day', e.target.value)} style={styles.inputCell}/>
                  </td>

                    <td style={styles.centerAlignedCell}>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={1}
                        value={p.is_weekend ?? 0}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : Number(e.target.value);
                          if (val === 0 || val === 1) {
                            handleProgramChange(p.originalIndex, 'is_weekend', val);
                          }
                        }}
                        style={{ ...styles.inputCell, textAlign: 'center', width: '60px' }}
                      />
                    </td>

                    <td style={styles.tableCell}>
                      {(() => {
                        const { start, end } = splitTimeRange(p.time);

                        return (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="time"
                              value={start}
                              onChange={(e) => {
                                const newTime = combineTimeRange(e.target.value, end);
                                handleProgramChange(p.originalIndex, 'time', newTime);
                              }}
                              style={{ ...styles.inputCell, minWidth: '110px' }}
                            />

                            <span>–</span>

                            <input
                              type="time"
                              value={end}
                              onChange={(e) => {
                                const newTime = combineTimeRange(start, e.target.value);
                                handleProgramChange(p.originalIndex, 'time', newTime);
                              }}
                              style={{ ...styles.inputCell, minWidth: '110px' }}
                            />
                          </div>
                        );
                      })()}
                    </td>

                  <td style={styles.tableCell}>
                    <input type="text" value={p.program} onChange={(e) => handleProgramChange(p.originalIndex, 'program', e.target.value)} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.cost} onChange={(e) => handleProgramChange(p.originalIndex, 'cost', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>

                  {/* Cargills Rate Input - Only for DERANA TV */}
                  {isDeranaTV && (
                    <td style={styles.rightAlignedCell}>
                      <input
                        type="number"
                        value={p.cargills_rate || ''}
                        onChange={(e) => handleProgramChange(p.originalIndex, 'cargills_rate', parseFloat(e.target.value))}
                        style={styles.inputCell}
                      />
                    </td>
                  )}

                  {/* Negotiated Rate Input */}
                  <td style={styles.rightAlignedCell}>
                    <input
                        type="number"
                        value={p.net_cost || ''}
                        disabled={!isSpecialChannel}
                        placeholder={!isSpecialChannel ? "-" : "0.00"}
                        onChange={(e) => handleProgramChange(p.originalIndex, 'net_cost', parseFloat(e.target.value))}
                        style={{
                            ...styles.inputCell,
                            backgroundColor: isSpecialChannel ? 'white' : '#edf2f7',
                            cursor: isSpecialChannel ? 'text' : 'not-allowed',
                            color: isSpecialChannel ? 'black' : '#a0aec0'
                        }}
                    />
                  </td>

                  {/* --- SLOT INPUT (RESTRICTED) --- */}
                  <td style={styles.centerAlignedCell}>
                    <input
                      type="text"
                      value={p.slot || ''}
                      onChange={(e) => handleProgramChange(p.originalIndex, 'slot', e.target.value)}
                      style={styles.inputCell}
                    />
                  </td>

                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_all} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_all', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_15_90} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_15_90', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_30_60} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_30_60', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_15_30} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_15_30', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_20_plus} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_20_plus', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_ab_15_plus} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_ab_15_plus', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_cd_15_plus} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_cd_15_plus', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_ab_female_15_45} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_ab_female_15_45', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_15_60} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_15_60', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_bcde_15_plus} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_bcde_15_plus', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abcde_15_plus} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abcde_15_plus', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_female_15_60} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_female_15_60', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>
                  <td style={styles.rightAlignedCell}>
                    <input type="number" value={p.tvr_abc_male_15_60} onChange={(e) => handleProgramChange(p.originalIndex, 'tvr_abc_male_15_60', parseFloat(e.target.value))} style={styles.inputCell}/>
                  </td>

                  <td style={styles.centerAlignedCell}>
                    <button style={styles.deleteButton} onClick={() => deleteProgram(p.program, p.slot)}>Delete</button>
                  </td>
                </tr>
                ))}
                {filteredPrograms.length === 0 && (
                    <tr>
                        <td colSpan={isDeranaTV ? "23" : "22"} style={{textAlign: 'center', padding: '20px', color: '#718096'}}>
                            No programs found matching your filters.
                        </td>
                    </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={styles.buttonGroup}>
            <button onClick={addNewProgram} style={styles.secondaryButton}>
              ➕ Add Program
            </button>

            <button
                onClick={saveChanges}
                style={{
                    ...styles.primaryButton,
                    opacity: isSaving ? 0.7 : 1,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
                disabled={isSaving}
            >
              {isSaving ? '⏳ Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

        <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
          <button onClick={onBack} style={styles.backButton}>
            Back to Home
          </button>

          <button onClick={downloadAllProgramsExcel} style={styles.ExportButton}>
            Download All Programs (Excel)
          </button>
        </div>
    </div>
  );
}

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
    columnWidths: {
      0: { minWidth: '120px' },
      1: { minWidth: '130px' },
      2: { minWidth: '260px' },
      3: { minWidth: '140px' },
    },
  channelSelector: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  label: {
    color: '#4a5568',
    fontWeight: '500',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: 'white',
    fontSize: '14px',
    minWidth: '200px',
  },
  instructionBox: {
    backgroundColor: '#fff5f5',
    border: '1px solid #fc8181',
    color: '#c53030',
    padding: '8px 12px',
    borderRadius: '6px',
    fontSize: '13px',
    lineHeight: '1.4',
    maxWidth: '600px',
  },
  infoColumn: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      flex: 1,
      alignItems: 'flex-end',
      marginLeft: 'auto',
  },
  hiruNoteInline: {
      backgroundColor: '#fff4e5',
      padding: '8px 12px',
      borderRadius: '6px',
      border: '1px solid #f6ad55',
      color: '#7b341e',
      fontSize: '13px',
      maxWidth: '650px',
      lineHeight: '1.4',
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
  addChannelContainer: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
    minWidth: '200px',
  },
  createButton: {
    padding: '8px 16px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#3182ce',
    },
  },
  channelCard: {
    marginBottom: '32px',
    border: '1px solid #e2e8f0',
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  channelHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  channelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  channelLogo: {
    height: '70px',
    width: 'auto',
    objectFit: 'contain',
    borderRadius: '4px',
  },
  channelName: {
    margin: 0,
    color: '#1a202c',
    fontSize: '25px',
    fontWeight: '600',
  },
  filterBar: {
    display: 'flex',
    gap: '20px',
    alignItems: 'end',
    backgroundColor: '#f8fafc',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid #edf2f7',
    flexWrap: 'wrap'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#4a5568',
    textTransform: 'uppercase'
  },
  searchInput: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e0',
    fontSize: '14px',
    width: '250px'
  },
  filterSelect: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e0',
    fontSize: '14px',
    minWidth: '150px',
    backgroundColor: 'white'
  },
  recordCount: {
      marginLeft: 'auto',
      fontSize: '14px',
      color: '#718096'
  },
  tableContainer: {
      width: '100%',
      overflowX: 'auto',
      overflowY: 'hidden',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      marginTop: '12px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '16px',
      whiteSpace: 'nowrap'
    },
  tableHeader: {
    padding: '12px 16px',
    textAlign: 'center',
    backgroundColor: '#f7fafc',
    color: '#4a5568',
    fontWeight: '600',
    borderBottom: '1px solid #e2e8f0',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    ':hover': {
      backgroundColor: '#f8fafc',
    },
  },
  tableCell: {
    padding: '12px 16px',
    color: '#4a5568',
  },
  inputCell: {
    width: '100%',
    padding: '8px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    fontSize: '14px',
    ':focus': {
      outline: 'none',
      borderColor: '#4299e1',
    },
  },
  rightAlignedCell: {
    padding: '12px 16px',
    color: '#4a5568',
    textAlign: 'right',
  },
  centerAlignedCell: {
    padding: '12px 16px',
    color: '#4a5568',
    textAlign: 'center',
  },
  deleteButton: {
      padding: '8px 14px',
      backgroundColor: '#EF4444',
      color: '#fff',
      border: '1px solid transparent',
      borderRadius: '0.3rem',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.3s ease-in-out',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
  },
  buttonGroup: {
    marginTop: '24px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
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
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#3182ce',
    },
  },
  secondaryButton: {
    padding: '10px 20px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
  backButton: {
    marginTop: '24px',
    padding: '10px 20px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
  ExportButton: {
    marginTop: '24px',
    padding: '10px 20px',
    backgroundColor: '#38a169',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
};

export default ProgramUpdater;