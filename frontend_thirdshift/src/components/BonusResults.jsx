// src/components/BonusResults.jsx
import React, { useState, useMemo } from 'react';

export default function BonusResults({
  channels = [],
  bonusReadyRows = [],
  bonusBudgetsByChannel = {},
  bonusCommercialPercentsByChannel = {},
  bonusChannelAllowPctByChannel = {},
  timeLimit = 120,
  maxSpots = 20,
  setBonusOptimizationResult = () => {},
  styles = {},
  formatLKR = (v) => v,
  onNext,
  onBack,
  // allow parent (e.g., BonusDfPreview) to inject result directly
  result: externalResult = null,
}) {
  // ---------------- state ----------------
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [localResult, setLocalResult] = useState(null);

  // ---------------- helpers ----------------
  const num = (v, d = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const toStr = (v) => (v == null ? '' : String(v));
  const safeFixed = (v, d = 2) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
  };

  // Prefer parent-supplied result; otherwise use locally-fetched
  const result = externalResult || localResult;

  // Endpoint call
  const handleOptimize = async () => {
    if (externalResult) return; // parent already provided results

    setLoading(true);
    setError('');
    setNote('');
    setLocalResult(null);

    try {
      const payload = {
        channels,
        programRows: bonusReadyRows,
        bonusBudgetsByChannel,
        bonusCommercialPercentsByChannel,
        channelAllowPctByChannel: bonusChannelAllowPctByChannel,
        timeLimitSec: parseInt(timeLimit, 10),
        maxSpots: parseInt(maxSpots, 10),
        commercialTolerancePct: 0.05,
      };

      const res = await fetch('https://optwebapp-production.up.railway.app/optimize-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || `Request failed with ${res.status}`);

      if (data?.success === false) {
        setError(data?.message || 'No feasible solution.');
        setLocalResult(null);
        setBonusOptimizationResult(null);
      } else {
        setLocalResult(data);
        setBonusOptimizationResult(data);
        if (data?.note) setNote(data.note);
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // ---------------- styles (kept as-is) ----------------
  const defaultStyles = {
    page: { padding: 24, maxWidth: 1280, margin: '0 auto' },
    resultContainer: {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: { fontSize: 22, fontWeight: 700, color: '#2d3748' },
    sub: { fontSize: 13, color: '#4a5568' },
    badge: {
      background: '#edf2f7',
      borderRadius: 999,
      padding: '4px 12px',
      fontSize: 12,
      color: '#2d3748',
      border: '1px solid #e2e8f0',
    },
    actions: { display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' },
    backBtn: {
      padding: '10px 16px',
      background: '#edf2f7',
      border: '1px solid #cbd5e0',
      borderRadius: 8,
      cursor: 'pointer',
      fontWeight: 600,
    },
    primaryButton: {
      padding: '10px 16px',
      background: '#2b6cb0',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontWeight: 600,
    },
    nextBtn: {
      padding: '10px 16px',
      background: '#38a169',
      color: '#fff',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontWeight: 600,
    },
    sectionTitle: { marginTop: 16, marginBottom: 10, fontSize: 18, fontWeight: 700, color: '#2d3748' },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 12,
      marginBottom: 8,
    },
    summaryCard: {
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 12,
      background: '#f9fafb',
    },
    summaryTitle: { fontSize: 13, fontWeight: 600, color: '#4a5568', marginBottom: 6 },
    summaryValue: { fontSize: 18, fontWeight: 500, color: '#1a202c' },
    channelBlock: {
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 12,
      background: '#ffffff',
      marginTop: 14,
    },
    channelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    channelTitle: { fontSize: 16, fontWeight: 800, color: '#2d3748' },
    channelKPIs: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
      gap: 8,
      marginTop: 6,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff',
    },
    tWrap: { overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' },
    th: { background: '#f7fafc', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' },
    td: { padding: '8px 10px', borderBottom: '1px solid #edf2f7', verticalAlign: 'top' },
    groupRow: { background: '#f1f5f9', fontWeight: 700, color: '#334155' },
    info: {
      background: '#f0fff4',
      border: '1px solid #9ae6b4',
      color: '#22543d',
      padding: 10,
      borderRadius: 8,
      marginTop: 12,
    },
    warn: {
      background: '#fffbea',
      border: '1px solid #f6e05e',
      color: '#744210',
      padding: 10,
      borderRadius: 8,
      marginTop: 12,
    },
    err: {
      background: '#fff5f5',
      border: '1px solid #feb2b2',
      color: '#742a2a',
      padding: 10,
      borderRadius: 8,
      marginTop: 12,
    },

    // Summary table (left-aligned)
    summaryTableWrap: {
      marginTop: 18,
      maxWidth: 720,
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      background: '#fff',
    },
    summaryTable: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 13,
    },
    summaryTh: { background: '#f7fafc', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0' },
    summaryTd: { padding: '8px 10px', borderBottom: '1px solid #edf2f7', verticalAlign: 'top' },
    totalsRow: { background: '#f9fafb', fontWeight: 800 },
  };

  const s = useMemo(() => ({ ...defaultStyles, ...styles }), [styles]);

  // ---------------- derive structures ----------------
  const byProgram = useMemo(() => result?.tables?.by_program || [], [result]);
  const byChannel = useMemo(() => result?.tables?.by_channel || [], [result]);
  const totals = result?.totals || {};

  // Build lookup from ready rows: by RowId and by composite key
  const { mapById, mapByKey } = useMemo(() => {
    const norm = (x) => toStr(x).trim().toLowerCase();
    const makeKey = (r) =>
      [
        norm(r.Channel),
        norm(r.Program ?? r['Name of the program']),
        norm(r.Day ?? r.Date ?? ''),
        norm(r.Time ?? ''),
        norm(r.Commercial ?? ''),
        norm(r.Duration ?? ''),
      ].join('|');

    const _mapById = new Map();
    const _mapByKey = new Map();
    (bonusReadyRows || []).forEach((r) => {
      const id = r.RowId ?? r.id ?? r._id ?? r.ID ?? r.Id;
      if (id !== undefined && id !== null) _mapById.set(String(id), r);
      _mapByKey.set(makeKey(r), r);
    });
    return { mapById: _mapById, mapByKey: _mapByKey };
  }, [bonusReadyRows]);

  // Enrichment function for a result row using ready-row metadata
  const enrichRow = (r) => {
    const norm = (x) => toStr(x).trim().toLowerCase();
    const id = r.RowId ?? r.id ?? r._id ?? r.ID ?? r.Id;

    let src = null;
    if (id !== undefined && id !== null && mapById.has(String(id))) {
      src = mapById.get(String(id));
    } else {
      const key = [
        norm(r.Channel),
        norm(r.Program ?? r['Name of the program']),
        norm(r.Day ?? r.Date ?? ''),
        norm(r.Time ?? ''),
        norm(r.Commercial ?? ''),
        norm(r.Duration ?? ''),
      ].join('|');
      src = mapByKey.get(key) || null;
    }

    // Prefer backend numeric fields for totals/spots, fallback to 0
    const Spots = num(r.Spots ?? 0);
    const Total_Cost = num(r.Total_Cost ?? 0);
    const Total_Rating = num(r.Total_Rating ?? r.Total_NTVR ?? 0);

    // Prefer backend fields for base metrics if present; else take from source
    const Program = toStr(r.Program ?? r['Name of the program'] ?? src?.Program ?? src?.['Name of the program'] ?? '');
    const Day = toStr(r.Day ?? r.Date ?? src?.Day ?? src?.Date ?? '');
    const Time = toStr(r.Time ?? src?.Time ?? '');
    const Cost = num(r.Cost ?? r.Rate ?? r['Rate (DB)'] ?? src?.Cost ?? src?.Rate ?? src?.['Rate (DB)'] ?? 0);
    const TVR = num(r.TVR ?? src?.TVR ?? 0);
    const NCost = num(r.NCost ?? src?.NCost ?? 0);
    const NTVR = num(r.NTVR ?? r.TVR ?? src?.NTVR ?? src?.TVR ?? 0);

    return {
      ...r,
      Program,
      Day,
      Time,
      Cost,
      TVR,
      NCost,
      NTVR,
      Spots,
      Total_Cost,
      Total_Rating,
    };
  };

  // Global totals (fallback to summing byProgram if not provided)
  const globalCost = useMemo(() => {
    const provided = num(totals.bonus_total_cost, NaN);
    if (Number.isFinite(provided)) return provided;
    return byProgram.reduce((acc, r) => acc + num(r.Total_Cost ?? r.TotalCost ?? r.Cost ?? 0), 0);
  }, [totals, byProgram]);

  const globalRating = useMemo(() => {
    const provided = num(totals.bonus_total_rating, NaN);
    if (Number.isFinite(provided)) return provided;
    return byProgram.reduce((acc, r) => acc + num(r.Total_Rating ?? r.Total_NTVR ?? r.NTVR ?? 0), 0);
  }, [totals, byProgram]);

  const globalCPRP = useMemo(() => (globalRating > 0 ? globalCost / globalRating : 0), [globalCost, globalRating]);

  // Build a map: channel -> { cost, rating, rowsGroupedByCommercial: { commercial: rows[] }, totalSpots }
  const channelMap = useMemo(() => {
    const chSet = new Set(
      (byChannel.map(r => toStr(r.Channel)) || []).concat(channels.map(toStr))
    );

    const base = {};
    for (const ch of chSet) {
      base[ch] = { cost: 0, rating: 0, rowsByCommercial: {}, totalSpots: 0 };
    }

    byProgram.forEach((r) => {
      const enriched = enrichRow(r);
      const ch = toStr(enriched.Channel);
      if (!base[ch]) base[ch] = { cost: 0, rating: 0, rowsByCommercial: {}, totalSpots: 0 };

      const commercial = toStr(enriched.Commercial ?? enriched['Com name'] ?? enriched.ComName ?? '');
      if (!base[ch].rowsByCommercial[commercial]) base[ch].rowsByCommercial[commercial] = [];
      base[ch].rowsByCommercial[commercial].push(enriched);

      base[ch].cost += num(enriched.Total_Cost ?? 0);
      base[ch].rating += num(enriched.Total_Rating ?? enriched.Total_NTVR ?? 0);
      base[ch].totalSpots += num(enriched.Spots ?? 0);
    });

    // Sort rows within each commercial (by Total_NTVR desc)
    Object.values(base).forEach((bucket) => {
      Object.keys(bucket.rowsByCommercial).forEach((cKey) => {
        bucket.rowsByCommercial[cKey].sort((a, b) => {
          const aR = num(a.Total_Rating ?? a.Total_NTVR ?? 0);
          const bR = num(b.Total_Rating ?? b.Total_NTVR ?? 0);
          return bR - aR;
        });
      });
    });

    return base;
  }, [byProgram, byChannel, channels]); // enrichRow closes over maps but they come from deps of byProgram/bonusReadyRows

  // Build a channel summary (prefer backend by_channel if available)
  const channelSummaryRows = useMemo(() => {
    if (byChannel && byChannel.length > 0) {
      return byChannel.map((r) => {
        const ch = toStr(r.Channel);
        const spots = num(r.Spots ?? r.Total_Spots ?? 0);
        const cost = num(r.Total_Cost ?? 0);
        const rating = num(r.Total_Rating ?? r.Total_NTVR ?? 0);
        const cprp = rating > 0 ? cost / rating : 0;
        return { Channel: ch, Spots: spots, Total_Cost: cost, Total_Rating: rating, CPRP: cprp };
      });
    }
    return Object.entries(channelMap).map(([ch, data]) => {
      const cprp = data.rating > 0 ? data.cost / data.rating : 0;
      return { Channel: ch, Spots: data.totalSpots, Total_Cost: data.cost, Total_Rating: data.rating, CPRP: cprp };
    });
  }, [byChannel, channelMap]);

  const channelSummaryTotals = useMemo(() => {
    const tSpots = channelSummaryRows.reduce((a, r) => a + num(r.Spots), 0);
    const tCost = channelSummaryRows.reduce((a, r) => a + num(r.Total_Cost), 0);
    const tRating = channelSummaryRows.reduce((a, r) => a + num(r.Total_Rating), 0);
    const tCPRP = tRating > 0 ? tCost / tRating : 0;
    return { Spots: tSpots, Total_Cost: tCost, Total_Rating: tRating, CPRP: tCPRP };
  }, [channelSummaryRows]);

  // ---------------- render ----------------
  return (
    <div style={s.page}>
      <div style={s.resultContainer}>
        {/* Header */}
        <div style={s.headerRow}>
          <div>
            <div style={s.title}>Bonus Program Optimization Result</div>
          </div>
        </div>

        {/* Actions */}
        <div style={s.actions}>
          {onBack && (
            <button type="button" onClick={onBack} style={s.backBtn} disabled={loading}>
              Go Back
            </button>
          )}
          {!externalResult && (
            <button
              type="button"
              onClick={handleOptimize}
              style={{ ...s.primaryButton, opacity: loading ? 0.7 : 1 }}
              disabled={loading || bonusReadyRows.length === 0}
            >
              {loading ? 'Optimization is processing…' : 'Start Bonus Optimization'}
            </button>
          )}
          {onNext && result && !error && (
            <button type="button" onClick={onNext} style={s.nextBtn}>
              See Final Plan
            </button>
          )}
        </div>

        {error && <div style={s.err}>{error}</div>}
        {note && !error && <div style={s.warn}>{note}</div>}

        {/* Global KPIs */}
        {result && !error && (
          <>
            <div style={s.summaryGrid}>
              <div style={s.summaryCard}>
                <div style={s.summaryTitle}>Total Bonus Budget</div>
                <div style={s.summaryValue}>{formatLKR(globalCost)}</div>
              </div>
              <div style={s.summaryCard}>
                <div style={s.summaryTitle}>Total Bonus NGRP</div>
                <div style={s.summaryValue}>{safeFixed(globalRating, 2)}</div>
              </div>
              <div style={s.summaryCard}>
                <div style={s.summaryTitle}>CPRP</div>
                <div style={s.summaryValue}>{safeFixed(globalCPRP, 2)}</div>
              </div>
            </div>

            {/* Channel-wise blocks */}
            <div style={s.sectionTitle}>Channel-wise Results</div>

            {Object.keys(channelMap).length === 0 && (
              <div style={s.warn}>No channel data to display.</div>
            )}

            {Object.entries(channelMap).map(([ch, data]) => {
              const chCost = data.cost;
              const chRating = data.rating;
              const chCPRP = chRating > 0 ? chCost / chRating : 0;

              const commercials = Object.keys(data.rowsByCommercial).sort((a, b) => {
                if (!a && b) return 1;
                if (!b && a) return -1;
                return a.localeCompare(b);
              });

              return (
                <div key={ch} style={s.channelBlock}>
                  <div style={s.channelHeader}>
                    <div style={s.channelTitle}>{ch || 'Unknown Channel'}</div>
                  </div>

                  {/* Channel KPIs */}
                  <div style={s.channelKPIs}>
                    <div style={s.summaryCard}>
                      <div style={s.summaryTitle}>Bonus Budget</div>
                      <div style={s.summaryValue}>{formatLKR(chCost)}</div>
                    </div>
                    <div style={s.summaryCard}>
                      <div style={s.summaryTitle}>Bonus NGRP</div>
                      <div style={s.summaryValue}>{safeFixed(chRating)}</div>
                    </div>
                    <div style={s.summaryCard}>
                      <div style={s.summaryTitle}>CPRP</div>
                      <div style={s.summaryValue}>{safeFixed(chCPRP)}</div>
                    </div>
                  </div>

                  {/* Table grouped by Commercial (with required columns/order) */}
                  <div style={{ marginTop: 10 }}>
                    <div style={s.tWrap}>
                      <table style={s.table}>
                        <thead>
                          <tr>
                            <th style={s.th}>Commercial</th>
                            <th style={s.th}>Program</th>
                            <th style={s.th}>Day</th>
                            <th style={s.th}>Time</th>
                            <th style={s.th}>Cost</th>
                            <th style={s.th}>TVR</th>
                            <th style={s.th}>NCost</th>
                            <th style={s.th}>NTVR</th>
                            <th style={s.th}>Total Budget</th>
                            <th style={s.th}>NGRP</th>
                            <th style={s.th}>Spots</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercials.length === 0 && (
                            <tr>
                              <td style={s.td} colSpan={11}>(No programs for this channel)</td>
                            </tr>
                          )}
                          {commercials.map((comKey, idx) => {
                            const rows = data.rowsByCommercial[comKey] || [];
                            if (!rows || rows.length === 0) return null;

                            return (
                              <React.Fragment key={idx}>
                                {rows.map((raw, i) => {
                                  const r = enrichRow(raw); // ensure all fields are present
                                  const costPerSpot = num(r.Cost ?? r.NCost ?? 0);
                                  const tvrPerSpot = num(r.TVR ?? r.NTVR ?? 0);
                                  const totalCost = num(r.Total_Cost ?? 0);
                                  const totalNtvr = num(r.Total_Rating ?? r.Total_NTVR ?? 0);
                                  const spots = num(r.Spots ?? 0);
                                  return (
                                    <tr key={`${idx}-${i}`}>
                                      <td style={s.td}>{toStr(r.Commercial ?? '')}</td>
                                      <td style={s.td}>{toStr(r.Program ?? '')}</td>
                                      <td style={s.td}>{toStr(r.Day ?? '')}</td>
                                      <td style={s.td}>{toStr(r.Time ?? '')}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR(costPerSpot)}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{safeFixed(tvrPerSpot)}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR(num(r.NCost ?? 0))}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{safeFixed(num(r.NTVR ?? 0))}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR(totalCost)}</td>
                                      <td style={{ ...s.td, textAlign: 'right' }}>{safeFixed(totalNtvr)}</td>
                                      <td style={{ ...s.td, textAlign: 'center' }}>{spots}</td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ---------------- Channel Summary (left-aligned) ---------------- */}
            <div style={s.sectionTitle}>Optimized Channel Summary</div>
            <div style={s.summaryTableWrap}>
              <table style={s.summaryTable}>
                <thead>
                  <tr>
                    <th style={s.summaryTh}>Channel</th>
                    <th style={s.summaryTh}>Spots</th>
                    <th style={s.summaryTh}>Total Cost</th>
                    <th style={s.summaryTh}>Total NTVR</th>
                    <th style={s.summaryTh}>CPRP</th>
                  </tr>
                </thead>
                <tbody>
                  {channelSummaryRows.length === 0 && (
                    <tr>
                      <td style={s.summaryTd} colSpan={5}>No summary available.</td>
                    </tr>
                  )}
                  {channelSummaryRows.map((r, i) => (
                    <tr key={i}>
                      <td style={s.summaryTd}>{toStr(r.Channel)}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{num(r.Spots)}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{formatLKR(num(r.Total_Cost))}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{safeFixed(num(r.Total_Rating))}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{safeFixed(num(r.CPRP))}</td>
                    </tr>
                  ))}
                  {channelSummaryRows.length > 0 && (
                    <tr style={s.totalsRow}>
                      <td style={s.summaryTd}>Total</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{num(channelSummaryTotals.Spots)}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{formatLKR(num(channelSummaryTotals.Total_Cost))}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{safeFixed(num(channelSummaryTotals.Total_Rating))}</td>
                      <td style={{ ...s.summaryTd, textAlign: 'right' }}>{safeFixed(num(channelSummaryTotals.CPRP))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {result?.solver_status && (
              <div style={s.info}><strong>Solver Status:</strong> {toStr(result.solver_status)}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
