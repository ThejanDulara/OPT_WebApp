// PropertyProgramsEditor.jsx
import React, { useMemo } from 'react';

const num = v => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
const iNum = v => (isNaN(parseInt(v)) ? 0 : parseInt(v));
const fmt2 = v => Number(v || 0).toFixed(2);

function makeRow() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    programName: '',
    comName: '',
    day: '',
    time: '',
    pt_npt: '',
    rateCardCost: '',
    budget: '',
    duration: '', // seconds
    language: '',
    TVR: '',
    spots: '',
  };
}

function computeComputed(row) {
  const duration = num(row.duration);
  const TVR = num(row.TVR);
  const spots = iNum(row.spots);
  const budget = num(row.budget);
  const rateCardCost = num(row.rateCardCost);

  const NTVR = (TVR / 30) * duration;      // NTVR = TVR/30*Duration
  const NCost = spots > 0 ? budget / spots : 0; // NCost = Budget/Spots
  const NGRP = NTVR * spots;               // NGRP = NTVR * Spots
  const GRP = TVR * spots;

  const rateCardTotal = rateCardCost * spots;

  return { NTVR, NCost, NGRP, GRP , rateCardTotal , totalBudget: budget,totalSaving: rateCardTotal - budget,cprp: NGRP > 0 ? budget / NGRP : 0};
}

export default function PropertyProgramsEditor({
  channels,
  hasProperty,
  propertyAmounts,         // { [channel]: number }
  propertyPrograms,        // { [channel]: Row[] }
  setPropertyPrograms,     // updater from parent
  formatLKR,
  styles
}) {
  // Derived per-channel totals & validity
  const perChannelTotals = useMemo(() => {
    const out = {};
    (channels || []).forEach(ch => {
      const rows = propertyPrograms[ch] || [];
      const totalBudget = rows.reduce((a, r) => a + num(r.budget), 0);
      const target = num(propertyAmounts[ch] || 0);
      const remaining = target - totalBudget;
      const ok = Math.abs(remaining) <= 0.5; // ≤ 50 cents tolerance
      out[ch] = { totalBudget, target, remaining, ok };
    });
    return out;
  }, [channels, propertyPrograms, propertyAmounts]);

  const handleAddRow = (ch) => {
    setPropertyPrograms(prev => {
      const rows = prev[ch] || [];
      return { ...prev, [ch]: [...rows, makeRow()] };
    });
  };

  const handleDeleteRow = (ch, id) => {
    setPropertyPrograms(prev => {
      const rows = (prev[ch] || []).filter(r => r.id !== id);
      return { ...prev, [ch]: rows };
    });
  };

    const handleChange = (ch, id, field, value) => {
      setPropertyPrograms(prev => {
        const rows = (prev[ch] || []).map(r => {
          let newVal = value;

          // Keep everything as string in state
          if (field === 'budget' || field === 'duration' || field === 'TVR' || field === 'spots') {
            newVal = value.replace(/^0+/, '');  // strip leading zeros
          }

          return r.id === id ? { ...r, [field]: newVal } : r;
        });
        return { ...prev, [ch]: rows };
      });
    };



    const visibleChannels = (channels || []).filter(
      ch => !!hasProperty[ch]
    );

  if (visibleChannels.length === 0) return null;

      const formatTime12Hour = (time24) => {
      if (!time24) return '';
      const [h, m] = time24.split(':').map(Number);

      const period = h >= 12 ? 'PM' : 'AM';
      const hour12 = h % 12 || 12;

      return `${hour12}.${m.toString().padStart(2, '0')} ${period}`;
    };

    const combineTimeRange = (start, end) => {
      if (!start) return '';
      if (start && !end) return formatTime12Hour(start);
      return `${formatTime12Hour(start)} – ${formatTime12Hour(end)}`;
    };

    const parseTime12To24 = (time12) => {
      if (!time12) return '';

      const cleaned = time12
        .trim()
        .replace(/\./g, ':')
        .replace(/\s+/g, ' ');

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


  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={styles.sectionTitle}>On cost breakdown (per channel)</h3>

      {visibleChannels.map((ch) => {
        const rows = propertyPrograms[ch] || [];
        const totals = perChannelTotals[ch] || { totalBudget: 0, target: 0, remaining: 0, ok: true };

        return (
          <div key={ch} style={{ ...styles.summaryCard, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img
                src={`/logos/${ch}.png`}
                alt={ch}
                style={{ height: '40px', width: 'auto', objectFit: 'contain', borderRadius: '4px' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <h4 style={{ ...styles.summaryTitle, fontSize: 16, fontWeight: 'bold', color: '#2d3748' }}>
                {ch}
              </h4>
            </div>
            <div style={{ fontSize: 12, color: '#718096' }}>
              ⏱ Please use the <strong>24-hour time format</strong> when updating the time column.
            </div>
              <div style={{ fontSize: 13, color: totals.ok ? '#2d3748' : '#e53e3e' }}>
                Target: <strong>{formatLKR(totals.target)}</strong> &nbsp;|&nbsp;
                Entered: <strong>{formatLKR(totals.totalBudget)}</strong> &nbsp;|&nbsp;
                Remaining: <strong>{formatLKR(totals.remaining)}</strong>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...styles.table, minWidth: 940 }}>
                <thead>
                  <tr>
                    <th style={styles.th}>Program</th>
                    <th style={styles.th}>Commercial name</th>
                    <th style={styles.th}>Duration</th>
                    <th style={styles.th}>Language</th>
                    <th style={styles.th}>Day</th>
                    <th style={styles.th}>Time</th>
                    <th style={styles.th}>PT / NPT</th>
                    <th style={styles.th}>Rate Card Cost</th>
                    <th style={styles.th}>On Cost</th>
                    <th style={styles.th}>Rate Card Total</th>
                    <th style={styles.th}>Total Budget</th>
                    <th style={styles.th}>Total Saving</th>
                    <th style={styles.th}>NCost</th>
                    <th style={styles.th}>TVR</th>
                    <th style={styles.th}>NTVR</th>
                    <th style={styles.th}>GRP</th>
                    <th style={styles.th}>NGRP</th>
                    <th style={styles.th}>CPRP</th>
                    <th style={styles.th}>Spots</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const { NTVR, NCost, NGRP, GRP, rateCardTotal} = computeComputed(r);
                    const totalBudget = num(r.budget);
                    const onCost = num(r.budget);
                    const cprp = NGRP > 0 ? onCost / NGRP : 0;
                    const totalSaving = rateCardTotal - totalBudget;

                    return (
                      <tr key={r.id}>
                        <td style={styles.td}>
                          <input
                            type="text"
                            value={r.programName}
                            onChange={e => handleChange(ch, r.id, 'programName', e.target.value)}
                            style={{ ...styles.numberInput, width: 180 }}
                          />
                        </td>
                        <td style={styles.td}>
                          <input
                            type="text"
                            value={r.comName}
                            onChange={e => handleChange(ch, r.id, 'comName', e.target.value)}
                            style={{ ...styles.numberInput, width: 140 }}
                          />
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.duration}
                            onChange={e => handleChange(ch, r.id, 'duration', e.target.value)}
                            style={{ ...styles.numberInput, width: 110, textAlign: 'right' }}
                          />
                        </td>

                        <td style={styles.td}>
                          <select
                            value={r.language}
                            onChange={(e) => handleChange(ch, r.id, "language", e.target.value)}
                            style={{ ...styles.numberInput, width: 130 }}
                          >
                            <option value="">Select</option>
                            <option value="Sinhala">Sinhala</option>
                            <option value="English">English</option>
                            <option value="Tamil">Tamil</option>
                          </select>
                        </td>

                        <td style={styles.td}>
                          <input
                            type="text"
                            value={r.day}
                            onChange={e => handleChange(ch, r.id, 'day', e.target.value)}
                            style={{ ...styles.numberInput, width: 100 }}
                          />
                        </td>
                        <td style={styles.td}>
                          {(() => {
                            const { start, end } = splitTimeRange(r.time);

                            return (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                  type="time"
                                  value={start}
                                  onChange={(e) => {
                                    const newVal = combineTimeRange(e.target.value, end);
                                    handleChange(ch, r.id, 'time', newVal);
                                  }}
                                  style={{ ...styles.numberInput, width: 110 }}
                                />

                                <span>–</span>

                                <input
                                  type="time"
                                  value={end}
                                  onChange={(e) => {
                                    const newVal = combineTimeRange(start, e.target.value);
                                    handleChange(ch, r.id, 'time', newVal);
                                  }}
                                  style={{ ...styles.numberInput, width: 110 }}
                                />
                              </div>
                            );
                          })()}
                        </td>
                        <td style={styles.td}>
                          <select
                            value={r.pt_npt}
                            onChange={(e) => handleChange(ch, r.id, "pt_npt", e.target.value)}
                            style={{ ...styles.numberInput, width: 120 }}
                          >
                            <option value="">Select</option>
                            <option value="A">{r.pt_npt === "A" ? "A" : "A (PT)"}</option>
                            <option value="B">{r.pt_npt === "B" ? "B" : "B (NPT)"}</option>
                          </select>
                        </td>

                        <td style={{ ...styles.td, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.rateCardCost}
                            onChange={(e) => handleChange(ch, r.id, "rateCardCost", e.target.value)}
                            style={{ ...styles.numberInput, width: 120, textAlign: 'right' }}
                          />
                        </td>

                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.budget}
                            onChange={e => handleChange(ch, r.id, 'budget', e.target.value)}
                            style={{ ...styles.numberInput, width: 120, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' ,width: 120}}>
                          {fmt2(rateCardTotal)}     {/* ⭐ NEW */}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', width: 120 }}>
                          {fmt2(r.budget)}   {/* ⭐ SAME VALUE AS On Cost */}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', width: 120 }}>
                          {fmt2(totalSaving)}     {/* ⭐ NEW */}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', color: r.spots > 0 ? '#2d3748' : '#e53e3e' }}>
                          {fmt2(NCost)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={r.TVR}
                            onChange={e => handleChange(ch, r.id, 'TVR', e.target.value)}
                            style={{ ...styles.numberInput, width: 100, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {fmt2(NTVR)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {fmt2(GRP)}             {/* ⭐ NEW */}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {fmt2(NGRP)}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', width: 120 }}>
                          {fmt2(cprp)}     {/* ⭐ NEW */}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={r.spots}
                            onChange={e => handleChange(ch, r.id, 'spots', e.target.value)}
                            style={{ ...styles.numberInput, width: 80, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ ...styles.td }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(ch, r.id)}
                            style={{ ...styles.smallSyncBtn, background: '#ffe5e5', borderColor: '#ffb3b3' }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={20} style={{ ...styles.td, textAlign: 'center', color: '#718096' }}>
                        No programs yet. Click “Add row”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => handleAddRow(ch)} style={styles.smallSyncBtn}>
                + Add row
              </button>
              {!totals.ok && (
                <span style={{ color: '#e53e3e', fontSize: 13 }}>
                  Total program Budget must equal Property amount for {ch}.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
