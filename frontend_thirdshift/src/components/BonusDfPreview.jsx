// src/components/BonusDfPreview.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import BonusResults from './BonusResults';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function BonusDfPreview({
  channels = [],
  selectedBonusPrograms = {},
  bonusBudgetsByChannel = {},
  bonusCommercialPercentsByChannel = {},
  commercialDurationsByChannel = {},
  maxSpots = 20,
  // 🔽 new optional knobs (safe defaults)
  channelAllowPctByChannel = {},     // e.g. { DERANA: 0.10, SIRASA: 0.10 }
  defaultChannelAllowPct = 0.10,     // ±10% if not provided per channel
  timeLimitSec = 120,
  commercialTolerancePct = 0.05,     // ±5% around commercial targets within each channel

  setBonusReadyRows = () => {},
  styles = {},
  formatLKR = (v) => v,
  onReady,   // no longer needed for navigation; we keep it for backward compat
  onBack,
  onBackToSetup = () => {},           // ✅ NEW
  onProceedToFinalPlan = () => {},    // ✅ NEW
  setBonusOptimizationResult = () => {},
})
{
  // ---------------- helpers ----------------
  const toStr = (v) => (v === null || v === undefined ? '' : String(v));
  const num = (v, dflt = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : dflt;
  };
  const getLogoPath = (channel) => `/logos/${channel}.png`;

  // strictly DB/original numbers
  const pickRate = (r) => num(r.Rate ?? r.DB_Rate ?? r.Cost ?? r.Price ?? r.Negotiated_Rate ?? 0);
  const pickTVR  = (r) => num(r.TVR ?? r.Rating ?? r.NTVR ?? 0);
  const pickDur  = (r) => num(r.Duration ?? r.DURATION ?? r.Dur ?? r.DUR ?? 30, 30);

  // commercial keys present anywhere → sorted com_1, com_2, ...
  const commercialKeys = useMemo(() => {
    const all = new Set();
    const consider = (obj) => Object.keys(obj || {}).forEach((k) => { if (String(k).startsWith('com_')) all.add(k); });
    channels.forEach((ch) => {
      consider(bonusCommercialPercentsByChannel?.[ch] || {});
      consider(commercialDurationsByChannel?.[ch] || {});
    });
    consider(bonusCommercialPercentsByChannel);
    consider(commercialDurationsByChannel);
    const arr = Array.from(all);
    if (arr.length === 0) return ['com_1', 'com_2'];
    return arr.sort((a, b) => num(a.split('_')[1]) - num(b.split('_')[1]));
  }, [channels, bonusCommercialPercentsByChannel, commercialDurationsByChannel]);

  const commercialOrder = useMemo(() => {
    const m = {};
    commercialKeys.forEach((k, i) => { m[k] = i; });
    return m;
  }, [commercialKeys]);

  // % map per channel (fallback to global OR even split)
  const percMap = useMemo(() => {
    const out = {};
    channels.forEach((ch) => {
      const chMap = bonusCommercialPercentsByChannel?.[ch];
      if (chMap && Object.keys(chMap).length) {
        out[ch] = { ...chMap };
      } else if (Object.keys(bonusCommercialPercentsByChannel || {}).some(k => String(k).startsWith('com_'))) {
        out[ch] = { ...bonusCommercialPercentsByChannel };
      } else {
        const n = Math.max(1, commercialKeys.length);
        const even = Math.floor(100 / n);
        const rest = 100 - even * n;
        const m = {};
        commercialKeys.forEach((ck, i) => (m[ck] = even + (i === n - 1 ? rest : 0)));
        out[ch] = m;
      }
    });
    return out;
  }, [channels, bonusCommercialPercentsByChannel, commercialKeys]);

  // duration map per channel (fallback to global OR 30)
  const durMap = useMemo(() => {
    const out = {};
    channels.forEach((ch) => {
      const chMap = commercialDurationsByChannel?.[ch];
      if (chMap && Object.keys(chMap).length) {
        out[ch] = { ...chMap };
      } else if (Object.keys(commercialDurationsByChannel || {}).some(k => String(k).startsWith('com_'))) {
        out[ch] = { ...commercialDurationsByChannel };
      } else {
        const m = {};
        commercialKeys.forEach((ck) => (m[ck] = 30));
        out[ch] = m;
      }
    });
    return out;
  }, [channels, commercialDurationsByChannel, commercialKeys]);

  // targets per channel per commercial = bonus budget × %
  const comTargetsByChannel = useMemo(() => {
    const out = {};
    channels.forEach((ch) => {
      const bb = num(bonusBudgetsByChannel?.[ch], 0);
      const m = {};
      (commercialKeys || []).forEach((ck) => {
        const pct = num(percMap?.[ch]?.[ck], 0);
        m[ck] = (bb * pct) / 100.0;
      });
      out[ch] = m;
    });
    return out;
  }, [channels, bonusBudgetsByChannel, percMap, commercialKeys]);

  // Build ready rows
  // Build ready rows (same logic, cleaned)
  const readyRowsUnsorted = useMemo(() => {
    let rid = 1;
    const rows = [];
    channels.forEach((ch) => {
      const chosen = selectedBonusPrograms?.[ch] || [];
      const comKeys = commercialKeys;
      chosen.forEach((raw) => {
        const baseRate = pickRate(raw);
        const baseTVR = pickTVR(raw);
        const baseDur = Math.max(1, pickDur(raw));
        comKeys.forEach((ck) => {
          const durSel = Math.max(1, num(durMap?.[ch]?.[ck], 30));
          const scale = durSel / baseDur;
          const ncost = baseRate * scale;
          const ntvr = baseTVR * scale;
          rows.push({
            RowId: rid++,
            Channel: ch,
            Program: raw.Program ?? raw.PROGRAM ?? '',
            Day: raw.Day ?? raw.Date ?? '',
            Time: raw.Time ?? raw.Start_Time ?? raw.StartTime ?? '',
            Slot: 'B',
            Commercial: ck,
            Duration: durSel,
            Cost: baseRate,
            TVR: baseTVR,
            NCost: ncost,
            NTVR: ntvr,
          });
        });
      });
    });
    const seen = new Set();
    const unique = [];
    rows.forEach((r) => {
      const key = `${r.Channel}|${r.Program}|${r.Commercial}|${r.Day}|${r.Time}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    });
    return unique;
    return rows;
  }, [channels, selectedBonusPrograms, commercialKeys, durMap]);


  // Sorted rows
    const readyRows = useMemo(() => {
      const safe = [...readyRowsUnsorted];
      const valOr = (v, d = '') => (v === null || v === undefined ? d : v);
      safe.sort((a, b) => {
        // 🧩 1️⃣ Sort by Commercial first (com_1, com_2, ...)
        const ai = num(commercialOrder[a.Commercial], 1e9);
        const bi = num(commercialOrder[b.Commercial], 1e9);
        if (ai !== bi) return ai - bi;

        // 🧩 2️⃣ Then sort by Channel
        const chCmp = String(a.Channel).localeCompare(String(b.Channel));
        if (chCmp !== 0) return chCmp;

        // 🧩 3️⃣ Then by Day, Time, Program
        const dCmp = String(valOr(a.Day)).localeCompare(String(valOr(b.Day)));
        if (dCmp !== 0) return dCmp;
        const tCmp = String(valOr(a.Time)).localeCompare(String(valOr(b.Time)));
        if (tCmp !== 0) return tCmp;
        return String(valOr(a.Program)).localeCompare(String(valOr(b.Program)));
      });
      return safe;
    }, [readyRowsUnsorted, commercialOrder]);

  useEffect(() => {
    setBonusReadyRows(readyRows);
  }, [readyRows, setBonusReadyRows]);

  // Channel preview (counts + targets)
  const previewSummary = useMemo(() => {
    const sum = {};
    channels.forEach((ch) => {
      const rows = readyRows.filter((r) => r.Channel === ch);
      const count = rows.length;
      const comTargets = comTargetsByChannel[ch] || {};
      const perCom = commercialKeys.map((ck) => ({ com: ck, target: comTargets[ck] || 0 }));
      sum[ch] = { count, perCom };
    });
    return sum;
  }, [channels, readyRows, comTargetsByChannel, commercialKeys]);

  // ---------------- optimization (inline) ----------------
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState('');
  const [optResult, setOptResult] = useState(null);

  // ref for scrolling to results
  const resultRef = useRef(null);

  // ref for scrolling down to the Start button
    const startBtnRef = useRef(null);
    const goDown = () => {
      startBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };


  const runOptimization = async () => {
    if (readyRows.length === 0) {
      alert('No programs selected for bonus (Slot B). Please go back and select at least one.');
      return;
    }
    setBonusReadyRows(readyRows);
    setOptimizing(true);
    setOptError('');
    setOptResult(null);

    try {
      const commercialTargetsByChannel = {};
      channels.forEach((ch) => {
        commercialTargetsByChannel[ch] = { ...(comTargetsByChannel[ch] || {}) };
      });

      const payload = {
        channels,
        bonusBudgetsByChannel,
        programRows: readyRows,
        commercialTargetsByChannel,
        channelAllowPctByChannel,
        defaultChannelAllowPct,
        timeLimitSec,
        maxSpots,
        commercialTolerancePct,
      };

      const res = await fetch('https://optwebapp-production.up.railway.app/optimize-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Request failed');

      if (!data?.success) {
        setOptError(data?.message || 'Optimization failed.');
        setOptResult(null);
      } else {
        setOptResult(data);
        setBonusOptimizationResult(data);

        // toast + smooth scroll
        toast.success('Bonus optimization complete! Scrolling to results…');
        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);
      }
    } catch (e) {
      setOptError(e.message || String(e));
      setOptResult(null);
    } finally {
      setOptimizing(false);
    }
  };

  // ---------------- styles ----------------
  const s = {
    page: { padding: 40, maxWidth: 1280, margin: '0 auto', background: '#d5e9f7', borderRadius: 12 },

    // Header
    titleRow: { display: 'flex', alignItems: 'center', gap: 10, },
    title: { fontSize: 22, fontWeight: 700, color: '#2d3748' },
    badge: { background: '#edf2f7', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: '#2d3748' },
    sub: { fontSize: 12, color: '#4a5568' },

    // Card container
    container: {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
      marginTop: 10,
    },

    container_2: {
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
      marginTop: 10,
      display: 'inline-block',
    },

    // Main table (inside the card)
    tableWrap: {
      overflow: 'auto',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      background: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'auto' },
    th: {
      position: 'sticky',
      top: 0,
      background: '#f7fafc',
      borderBottom: '1px solid #e2e8f0',
      padding: '8px 10px',
      textAlign: 'left'
    },
    td: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', verticalAlign: 'top' },

    toolbar: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 8,
    },
    // Summary block title + wrapper
    summaryBlock: { marginTop: 16 },
    summaryTitle: { fontWeight: 600, marginBottom: 8, color: '#2d3748' },

    summaryWrap: {
      display: 'inline-block',
      maxWidth: '100%',
      overflowX: 'auto',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      background: '#fff',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    },
    sumTable: {
      width: 'auto',
      borderCollapse: 'collapse',
      fontSize: 13,
    },
    sumTH: {
      position: 'sticky',
      top: 0,
      background: '#f7fafc',
      borderBottom: '1px solid #e2e8f0',
      padding: '8px 10px',
      textAlign: 'center',
      whiteSpace: 'nowrap'
    },
    sumTD: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap' },

    // Channel cols
    sumTDLogo: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', width: 30, textAlign: 'left' },
    sumTDName: { borderBottom: '1px solid #edf2f7', padding: '8px 10px', textAlign: 'left' },
    chCell: { display: 'flex', alignItems: 'center' },
    chLogo: { height: 30, width: 30, objectFit: 'contain', borderRadius: 4, flex: '0 0 24px' },

    // Buttons
    actions: { display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' },
    backBtn: { padding: '12px 18px', background: '#edf2f7', border: '1px solid #cbd5e0', borderRadius: 6, cursor: 'pointer' },
    nextBtn: { padding: '12px 18px', background: '#3182ce', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' },

    // Opt states
    inlineMsg: { marginTop: 8, fontSize: 13, color: '#4a5568' },
    errorMsg: { marginTop: 8, fontSize: 13, color: '#c53030' },
  };

  // ---------------- render ----------------
  return (
    <div style={s.page}>
      {/* Single ToastContainer on this page (ok if you don't have a global one) */}
      <ToastContainer position="top-right" autoClose={3500} />

      {/* Header */}
      <div style={s.titleRow}>
        <div style={s.title}>Bonus Optimization-Ready Table</div>
      </div>
    <div style={s.toolbar}>
      <button type="button" onClick={goDown} style={s.backBtn}>Go Down</button>
    </div>

      {/* Main optimization-ready table */}
      <div style={s.container}>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Commercial</th>
                <th style={s.th}>Channel</th>
                <th style={s.th}>Day</th>
                <th style={s.th}>Time</th>
                <th style={s.th}>Program</th>
                <th style={s.th}>Rate (DB)</th>
                <th style={s.th}>TVR</th>
                <th style={s.th}>NCost</th>
                <th style={s.th}>NTVR</th>
              </tr>
            </thead>
            <tbody>
              {readyRows.map((r, idx) => (
                <tr key={`${r.RowId}-${idx}`}>
                  <td style={s.td}>{toStr(r.Commercial)}</td>
                  <td style={s.td}>{toStr(r.Channel)}</td>
                  <td style={s.td}>{toStr(r.Day)}</td>
                  <td style={s.td}>{toStr(r.Time)}</td>
                  <td style={s.td}>{toStr(r.Program)}</td>
                  <td style={s.td}>{formatLKR(r.Cost)}</td>
                  <td style={s.td}>{r.TVR?.toFixed ? r.TVR.toFixed(2) : r.TVR}</td>
                  <td style={s.td}>{formatLKR(r.NCost)}</td>
                  <td style={s.td}>{r.NTVR?.toFixed ? r.NTVR.toFixed(2) : r.NTVR}</td>
                </tr>
              ))}
              {readyRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...s.td, color: '#718096' }}>
                    No data. Go back and select at least one Slot-B program.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel Summary */}
      <div style={s.summaryBlock}>
        <div style={s.summaryTitle}>Channel Summary (targets from bonus budgets)</div>
        <div style={s.container_2}>
          <div style={s.summaryWrap}>
            <table style={s.sumTable}>
              <thead>
                <tr>
                  <th style={s.sumTH} colSpan={2}>Channel</th>
                  <th style={s.sumTH}>Bonus Budget (LKR)</th>
                  {commercialKeys.map((ck) => (
                    <th key={ck} style={s.sumTH}>{ck.toUpperCase()} Target</th>
                  ))}
                  <th style={s.sumTH}>Rows</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => {
                  const bb = num(bonusBudgetsByChannel?.[ch], 0);
                  const sum = previewSummary[ch] || { count: 0, perCom: [] };
                  const perComMap = (sum.perCom || []).reduce((m, { com, target }) => { m[com] = target; return m; }, {});
                  return (
                    <tr key={ch}>
                      <td style={s.sumTDLogo}>
                        <img
                          src={getLogoPath(ch)}
                          alt={ch}
                          style={s.chLogo}
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                        />
                      </td>
                      <td style={s.sumTDName}>
                        <span style={s.chCell}>
                          <span style={{ width: 0, height: 0 }} />
                          {ch}
                        </span>
                      </td>

                      <td style={s.sumTD}>{formatLKR(bb)}</td>
                      {commercialKeys.map((ck) => (
                        <td key={ck} style={s.sumTD}>{formatLKR(perComMap[ck] || 0)}</td>
                      ))}
                      <td style={s.sumTD}>{sum.count}</td>
                    </tr>
                  );
                })}
                {channels.length === 0 && (
                  <tr>
                    <td colSpan={3 + commercialKeys.length + 1} style={{ ...s.sumTD, color: '#718096' }}>
                      No channels. Go back and select at least one Slot-B program.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={s.actions}>
        <button type="button" onClick={onBack} style={s.backBtn}>Go Back</button>
        <button
          type="button"
          onClick={runOptimization}
          style={{ ...s.nextBtn, opacity: readyRows.length && !optimizing ? 1 : 0.6 }}
          disabled={!readyRows.length || optimizing}
          ref={startBtnRef}
        >
          {optimizing ? 'Optimizing…' : 'Start Bonus Program Optimization'}
        </button>
      </div>

      {/* Inline messages / results */}
      {optError ? <div style={s.errorMsg}>⚠️ {optError}</div> : null}

        {optResult ? (
          <BonusResults
            result={optResult}
            formatLKR={formatLKR}
            onBackToSetup={onBackToSetup}
            onProceedToFinalPlan={onProceedToFinalPlan}
          />
        ) : null}
    </div>
  );
}
