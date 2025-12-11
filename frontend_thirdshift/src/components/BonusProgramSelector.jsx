// src/components/BonusProgramSelector.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';

export default function BonusProgramSelector({
  channels = [],
  allDbPrograms = [],
  selectedBonusPrograms = {},               // { [channel]: Array<row> } from saved plan
  setSelectedBonusPrograms = () => {},
  onNext,
  onBack,
}) {
  // --- helpers ---
  const toStr = useCallback((v) => (v === null || v === undefined ? '' : String(v)), []);
  const normSlot = useCallback((s) => toStr(s).trim().toUpperCase(), [toStr]);
  const fmt = useCallback((n) =>
    (Number(n) || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 }), []);

  // A robust row key using only stable identifying fields (not pricing/TVR data)
  const rowKey = useCallback((r) => [
    toStr(r.Channel || ''),
    toStr(r.Program || ''),
    toStr(r.Day || r.Date || ''),
    toStr(r.Time || r.Start_Time || r.StartTime || ''),
    toStr(r.Slot || 'B'),
  ].join('||'), [toStr]);

  // Only Slot B (non-prime) rows, group by channel
  const slotBByChannel = useMemo(() => {
    const out = {};
    channels.forEach((ch) => (out[ch] = []));
    const seen = new Set();

    (allDbPrograms || []).forEach((r) => {
      const ch = r.Channel;
      if (!ch || !channels.includes(ch)) return;
      if (normSlot(r.Slot) !== 'B') return;

      const key = [ch, r.Program, r.Day ?? r.Date ?? '', r.Time ?? r.Start_Time ?? r.StartTime ?? ''].join('||');
      if (seen.has(key)) return; // skip duplicate
      seen.add(key);

      out[ch].push(r);
    });
    return out;
  }, [allDbPrograms, channels, normSlot]);

  // Local UI state: search text per channel, and checkbox state per channel
  const [searchTextByChannel, setSearchTextByChannel] = useState({});
  const [checkedByChannel, setCheckedByChannel] = useState({}); // {ch: Set(rowKey)}

  // ⭐ CRITICAL: Restore saved selections when component loads
  useEffect(() => {
    console.log('🔍 Restoring bonus selections:', {
      hasSavedSelections: selectedBonusPrograms && Object.keys(selectedBonusPrograms).length > 0,
      channels,
      slotBRowCount: Object.values(slotBByChannel).reduce((sum, arr) => sum + (arr?.length || 0), 0),
      allDbProgramsCount: allDbPrograms?.length || 0
    });

    const seeded = {};
    channels.forEach((ch) => {
      const currentRows = slotBByChannel[ch] || []; // Current rows from fresh dfFull
      seeded[ch] = new Set();

      // If we have saved selections for this channel
      if (selectedBonusPrograms && selectedBonusPrograms[ch] && Array.isArray(selectedBonusPrograms[ch])) {
        const savedRows = selectedBonusPrograms[ch]; // Saved rows from old plan

        console.log(`📊 Channel ${ch}:`, {
          savedRowsCount: savedRows.length,
          currentRowsCount: currentRows.length,
          savedIds: savedRows.map(r => r.Id || r.id || r.ID).filter(Boolean),
          currentIds: currentRows.map(r => r.Id || r.id || r.ID).filter(Boolean)
        });

        savedRows.forEach((savedRow, index) => {
          const savedId = savedRow.Id || savedRow.id || savedRow.ID;

          // TRY 1: Match by ID (most reliable)
          let matchingRow = null;

          if (savedId) {
            matchingRow = currentRows.find(currentRow => {
              const currentId = currentRow.Id || currentRow.id || currentRow.ID;
              return String(currentId) === String(savedId);
            });

            if (matchingRow) {
              console.log(`✅ Matched by ID: ${savedId} - ${savedRow.Program}`);
            }
          }

          // TRY 2: If no ID match, try detailed matching
          if (!matchingRow) {
            matchingRow = currentRows.find(currentRow => {
              // Normalize all strings for comparison
              const normalize = (str) => toStr(str).trim().toUpperCase().replace(/\s+/g, ' ');

              return (
                normalize(currentRow.Channel) === normalize(savedRow.Channel) &&
                normalize(currentRow.Program) === normalize(savedRow.Program) &&
                normalize(currentRow.Day || currentRow.Date) === normalize(savedRow.Day || savedRow.Date) &&
                normalize(currentRow.Time || currentRow.Start_Time || currentRow.StartTime) ===
                normalize(savedRow.Time || savedRow.Start_Time || savedRow.StartTime) &&
                normSlot(currentRow.Slot) === normSlot(savedRow.Slot)
              );
            });

            if (matchingRow) {
              console.log(`✅ Matched by details: ${savedRow.Program}`);
            }
          }

          // TRY 3: Last resort - match by program name only (loosest match)
          if (!matchingRow) {
            matchingRow = currentRows.find(currentRow => {
              const normalize = (str) => toStr(str).trim().toUpperCase().replace(/\s+/g, ' ');
              return normalize(currentRow.Program) === normalize(savedRow.Program);
            });

            if (matchingRow) {
              console.log(`⚠️ Loosely matched by program name only: ${savedRow.Program}`);
            }
          }

          if (matchingRow) {
            // Found match - select it
            seeded[ch].add(rowKey(matchingRow));
          } else {
            console.log(`❌ No match found for saved program ${index}:`, {
              channel: ch,
              id: savedId,
              program: savedRow.Program,
              day: savedRow.Day,
              time: savedRow.Time,
              slot: savedRow.Slot
            });
          }
        });
      }
    });

    console.log('📋 Seeded checkbox states:', {
      seeded: Object.fromEntries(
        Object.entries(seeded).map(([ch, set]) => [ch, Array.from(set)])
      ),
      totalSelected: Object.values(seeded).reduce((sum, set) => sum + set.size, 0)
    });

    setCheckedByChannel(seeded);
  }, [channels, slotBByChannel, selectedBonusPrograms, rowKey, toStr, normSlot]);

  const filteredRowsByChannel = useMemo(() => {
    const out = {};
    channels.forEach((ch) => {
      const q = toStr(searchTextByChannel[ch]).toLowerCase();
      const base = slotBByChannel[ch] || [];
      if (!q) {
        out[ch] = base;
      } else {
        out[ch] = base.filter((r) => {
          const hay =
            `${toStr(r.Program)} ${toStr(r.Day)} ${toStr(r.Time ?? r.Start_Time ?? r.StartTime)} ${toStr(r.Duration)}`
              .toLowerCase();
          return hay.includes(q);
        });
      }
    });
    return out;
  }, [channels, searchTextByChannel, slotBByChannel, toStr]);

  const toggleRow = useCallback((ch, r) => {
    const k = rowKey(r);
    setCheckedByChannel((prev) => {
      const next = { ...prev };
      next[ch] = new Set(next[ch] || []);
      if (next[ch].has(k)) next[ch].delete(k);
      else next[ch].add(k);
      return next;
    });
  }, [rowKey]);

  const selectAllVisible = useCallback((ch) => {
    setCheckedByChannel((prev) => {
      const next = { ...prev };
      next[ch] = new Set(next[ch] || []);
      (filteredRowsByChannel[ch] || []).forEach((r) => next[ch].add(rowKey(r)));
      return next;
    });
  }, [filteredRowsByChannel, rowKey]);

  const clearAll = useCallback((ch) => {
    setCheckedByChannel((prev) => {
      const next = { ...prev };
      next[ch] = new Set();
      return next;
    });
  }, []);

  const totalSelected = useMemo(() => {
    return channels.reduce((acc, ch) => acc + (checkedByChannel[ch]?.size || 0), 0);
  }, [channels, checkedByChannel]);

  const handleProceed = useCallback(() => {
    if (totalSelected === 0) {
      alert('Please select at least one non-prime (Slot B) program to continue.');
      return;
    }
    // Build {channel: Array<row>} using the keys we kept
    const payload = {};
    channels.forEach((ch) => {
      const keys = checkedByChannel[ch] || new Set();
      const allRows = slotBByChannel[ch] || [];
      payload[ch] = allRows.filter((r) => keys.has(rowKey(r)));
    });

    console.log('💾 Saving selected bonus programs:', {
      payloadCount: Object.values(payload).reduce((sum, arr) => sum + arr.length, 0),
      payloadChannels: Object.keys(payload)
    });

    setSelectedBonusPrograms(payload);
    onNext && onNext();
  }, [totalSelected, channels, checkedByChannel, slotBByChannel, rowKey, setSelectedBonusPrograms, onNext]);

  // ---- styles ----
  const styles = {
    page: { padding: 24, maxWidth: 1280, margin: '0 auto', background: '#d5e9f7', borderRadius: 12 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 22, fontWeight: 700, color: '#2d3748' },
    hint: { fontSize: 13, color: '#4a5568' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 },
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, overflow: 'hidden' },
    cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    chLeft: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#2d3748' },
    logo: { height: 28, width: 'auto', objectFit: 'contain', borderRadius: 4 },
    searchRow: { display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 12px' },
    searchInput: { flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6 },
    smlBtn: { padding: '6px 10px', borderRadius: 6, background: '#edf2f7', border: '1px solid #cbd5e0', cursor: 'pointer' },
    tableWrap: { maxHeight: 360, overflow: 'auto', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'auto' },
    th: { position: 'sticky', top: 0, background: '#f7fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 10px', textAlign: 'center' },
    td: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', verticalAlign: 'top' },
    actions: { display: 'flex', gap: 12, marginTop: 16 },
    backBtn: { padding: '12px 18px', background: '#edf2f7', border: '1px solid #cbd5e0', borderRadius: 6, cursor: 'pointer' },
    nextBtn: { padding: '12px 18px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },
    badge: { background: '#edf2f7', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: '#2d3748' },
    numTd: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', textAlign: 'right' },
  };

  const logoPath = (ch) => `/logos/${ch}.png`;

  const selectAllGlobal = useCallback(() => {
    setCheckedByChannel((prev) => {
      const next = { ...prev };
      channels.forEach((ch) => {
        next[ch] = new Set(next[ch] || []);
        (slotBByChannel[ch] || []).forEach((r) => next[ch].add(rowKey(r)));
      });
      return next;
    });
  }, [channels, slotBByChannel, rowKey]);

  const clearAllGlobal = useCallback(() => {
    setCheckedByChannel((prev) => {
      const next = {};
      channels.forEach((ch) => {
        next[ch] = new Set(); // clear all
      });
      return next;
    });
  }, [channels]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Bonus Program Selection (Non-Prime)</div>
          <div style={styles.hint}>
            Select Slot B programs for bonus optimization. Saved selections are automatically restored.
            {selectedBonusPrograms && Object.keys(selectedBonusPrograms).length > 0 && (
              <span style={{ color: '#3182ce', fontWeight: 'bold' }}>
                {' '}(Restoring {Object.values(selectedBonusPrograms).reduce((sum, arr) => sum + (arr?.length || 0), 0)} saved programs)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={selectAllGlobal} style={styles.smlBtn}>
            Select All (Global)
          </button>
          <button type="button" onClick={clearAllGlobal} style={styles.smlBtn}>
            Clear All (Global)
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        {channels.map((ch) => {
          const rows = filteredRowsByChannel[ch] || [];
          const checked = checkedByChannel[ch] || new Set();
          const savedCount = selectedBonusPrograms?.[ch]?.length || 0;

          return (
            <div key={ch} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.chLeft}>
                  <img
                    src={logoPath(ch)}
                    alt={ch}
                    style={styles.logo}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <span>{ch}</span>
                  {savedCount > 0 && (
                    <span style={{
                      fontSize: 12,
                      color: '#3182ce',
                      background: '#ebf8ff',
                      padding: '2px 8px',
                      borderRadius: 12
                    }}>
                      {savedCount} saved
                    </span>
                  )}
                </div>
                <div style={styles.badge}>
                  {checked.size} of {rows.length} selected
                </div>
              </div>

              <div style={styles.searchRow}>
                <input
                  placeholder="Search by program / day / time..."
                  value={searchTextByChannel[ch] || ''}
                  onChange={(e) =>
                    setSearchTextByChannel((prev) => ({ ...prev, [ch]: e.target.value }))
                  }
                  style={styles.searchInput}
                />
                <button type="button" onClick={() => selectAllVisible(ch)} style={styles.smlBtn}>
                  Select All
                </button>
                <button type="button" onClick={() => clearAll(ch)} style={styles.smlBtn}>
                  Clear
                </button>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Select</th>
                      <th style={styles.th}>Program</th>
                      <th style={styles.th}>Day</th>
                      <th style={styles.th}>Time</th>
                      <th style={{ ...styles.th, whiteSpace: 'nowrap' }}>RC Rate</th>
                      <th style={styles.th}>TVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const k = rowKey(r);
                      const isOn = checked.has(k);
                      const time = r.Time ?? r.Start_Time ?? r.StartTime ?? '';
                      const rate = r.Rate ?? r.DB_Rate ?? r.Cost ?? '';
                      const tvr = r.TVR ?? r.Rating ?? r.NTVR ?? '';
                      const programId = r.Id || r.id || r.ID;

                      // Check if this program was in saved selections
                      const wasSaved = selectedBonusPrograms?.[ch]?.some(saved =>
                        String(saved.Id || saved.id || saved.ID) === String(programId)
                      );

                      return (
                        <tr
                          key={`${k}-${idx}`}
                          style={wasSaved ? { backgroundColor: '#f0fff4' } : {}}
                        >
                          <td style={styles.td}>
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleRow(ch, r)}
                            />
                            {wasSaved && (
                              <span style={{
                                fontSize: 10,
                                color: '#38a169',
                                marginLeft: 4
                              }} title="Previously saved">
                                ✓
                              </span>
                            )}
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                            {toStr(r.Program)}
                            {programId && (
                              <span style={{
                                fontSize: 10,
                                color: '#718096',
                                marginLeft: 4
                              }}>
                                (ID: {programId})
                              </span>
                            )}
                          </td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{toStr(time)}</td>
                          <td style={styles.numTd}>{fmt(rate)}</td>
                          <td style={styles.numTd}>{toStr(tvr)}</td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ ...styles.td, color: '#718096' }}>
                          No Slot B programs match your filter for {ch}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.actions}>
        <button type="button" onClick={onBack} style={styles.backBtn}>
          Go Back
        </button>
        <button
          type="button"
          onClick={handleProceed}
          style={{ ...styles.nextBtn, opacity: totalSelected > 0 ? 1 : 0.7 }}
          disabled={totalSelected === 0}
        >
          Proceed to Bonus Optimization-Ready Table ({totalSelected} programs selected)
        </button>
      </div>
    </div>
  );
}