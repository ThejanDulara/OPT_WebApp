// OptimizationResults.jsx
import React from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function OptimizationResults({
  result,
  displayOrder,
  summaryOrder,
  formatLKR,
  inclusiveTotals,
  channels,
  propertyPrograms,
  onProceedToBonus,
  onHome,
  onExport,
  channelBaseBudgets,
  commercialPercentsByChannel,
  commercialDurationsByChannel,
  defaultChannelBoundPct,
  maxSpots,
  timeLimit,
  allDbPrograms,
  propertyRunSummary,
  setMainOptimizationResult
}) {
  // Define styles within the component
  const styles = {
    container: {marginTop: '24px', padding: '32px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '24px' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '24px' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
    summaryCard: { marginBottom: '24px',backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' },
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    exportButton: { padding: '12px 24px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', marginTop: '24px', marginRight: '20px' },
    backHomeButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px', marginRight: '20px' },
    primaryButton: { padding: '12px 24px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' }
  };

  const toFixedOrInt = (key, val) => {
    const numericCols = ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'];
    const isNumeric = numericCols.includes(key);
    const isCount = key === 'Spots';
    if (isCount) return parseInt(val);
    if (isNumeric) return Number(val).toFixed(2);
    return val;
  };

  // keep this helper near the top (you already have it in your file)
  const handleProceedToBonus = () => {
    console.log('Proceed to bonus clicked');
    onProceedToBonus?.();
  };

  const handleExportToExcel = () => {
    if (!result || !result.df_result || result.df_result.length === 0) {
      alert('No data to export.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const desiredOrder = displayOrder;

    // Channel, Name of the program, Com name, Day, Time, Budget, NCost, Duration, TVR, NTVR, Spots, NGRP
    const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

    const propertyRows = [];
    (channels || []).forEach((ch) => {
      const rows = (propertyPrograms?.[ch] || []);
      rows.forEach((r) => {
        // accept either camelCase or Title Case keys
        const name      = r.programName ?? r['Name of the program'] ?? r.programName ?? r['Name of the program'] ?? '';
        const comName   = r.comName ?? r['Com name'] ?? r.ComName ?? r['Com Name'] ?? '';
        const day       = r.day ?? r.Day ?? '';
        const time      = r.time ?? r.Time ?? '';

        const budget    = toNum(r.budget ?? r.Budget);
        const duration  = toNum(r.duration ?? r.Duration);
        const tvr       = toNum(r.tvr ?? r.TVR);
        const spots     = parseInt(r.spots ?? r.Spots ?? 0, 10) || 0;

        const ntvrRaw   = r.ntvr ?? r.NTVR;
        const ntvr      = ntvrRaw != null ? toNum(ntvrRaw) : (tvr / 30) * duration;

        const ncostRaw  = r.ncost ?? r.NCost;
        const ncost     = ncostRaw != null ? toNum(ncostRaw) : (spots > 0 ? budget / spots : 0);

        const ngrpRaw   = r.ngrp ?? r.NGRP;
        const ngrp      = ngrpRaw != null ? toNum(ngrpRaw) : (ntvr * spots);

        propertyRows.push({
          Channel: ch,
          'Name of the program': name,
          'Com name': comName,
          Day: day,
          Time: time,
          Budget: budget,
          NCost: ncost,
          Duration: duration,
          TVR: tvr,
          NTVR: ntvr,
          Spots: spots,
          NGRP: ngrp,
        });
      });
    });

    const wsProperty = XLSX.utils.json_to_sheet(propertyRows);
    XLSX.utils.book_append_sheet(workbook, wsProperty, 'Property Programs');

    // One sheet per commercial
    (result.commercials_summary || []).forEach((c, idx) => {
      const headerMap = { 'Total_Cost': 'Total Budget', 'Total_Rating': 'NGRP' };
      const cleanedData = (c.details || []).map(row => {
        const newRow = {};
        desiredOrder.forEach(key => (newRow[headerMap[key] || key] = row[key]));
        return newRow;
      });
      const ws = XLSX.utils.json_to_sheet(cleanedData);
      XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
    });

    // Summary sheet
    const summaryOrder_ex = [
      'Channel','Total_Cost','% Cost','Total_Rating','% Rating',
      'Prime Cost','Prime Cost %','Non-Prime Cost','Non-Prime Cost %','Prime Rating','Non-Prime Rating',
    ];
    const summaryHeaderMap = {
      'Total_Cost': 'Total Budget',
      '% Cost': 'Budget %',
      'Total_Rating': 'NGRP',
      '% Rating': 'NGRP %',
      'Prime Cost': 'PT Budget',
      'Non-Prime Cost': 'NPT Budget',
      'Prime Rating': 'PT NGRP',
      'Non-Prime Rating': 'NPT NGRP',
      'Prime Cost %': 'PT Budget %',
      'Non-Prime Cost %': 'NPT Budget %',
    };

    if (result.channel_summary && result.channel_summary.length > 0) {
      const cleanedSummary = result.channel_summary.map(row => {
        const newRow = {};
        summaryOrder_ex.forEach(key => (newRow[summaryHeaderMap[key] || key] = row[key]));
        return newRow;
      });
      const wsSummary = XLSX.utils.json_to_sheet(cleanedSummary);
      XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');
    }

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(fileData, 'optimized_schedule.xlsx');
  };

  return (
    <div id="optimization-summary" style={styles.container}>
      <div style={styles.resultContainer}>
        <h3 style={styles.sectionTitle}>Final Optimization Result</h3>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>Optimized Budget (excl. Property)</h4>
            <p style={styles.summaryValue}>{formatLKR(result.total_cost)}</p>
          </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>NGRP (excl. Property)</h4>
            <p style={styles.summaryValue}>{Number(result.total_rating).toFixed(2)}</p>
          </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>CPRP (excl. Property)</h4>
            <p style={styles.summaryValue}>{Number(result.cprp).toFixed(2)}</p>
          </div>
        </div>
        {/* Existing summary cards (excl. property) remain unchanged */}

        {/* New: inclusive totals (includes property) */}
        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>Total Budget (incl. Property)</h4>
            <p style={styles.summaryValue}>
              {formatLKR(inclusiveTotals?.totalBudgetIncl || result.total_cost)}
            </p>
          </div>

          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>NGRP (incl. Property)</h4>
            <p style={styles.summaryValue}>
              {Number(inclusiveTotals?.totalNGRPIncl || result.total_rating).toFixed(2)}
            </p>
          </div>

          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>CPRP (incl. Property)</h4>
            <p style={styles.summaryValue}>
              {Number(inclusiveTotals?.cprpIncl || result.cprp).toFixed(2)}
            </p>
          </div>
        </div>

        <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
        {(result.commercials_summary || []).map((c, idx) => (
          <div key={idx} style={styles.summaryCard}>
            <h4 style={styles.label}>Commercial {c.commercial_index + 1}</h4>
            <p>Total Budget: {formatLKR(c.total_cost)}</p>
            <p>NGRP: {Number(c.total_rating).toFixed(2)}</p>
            <p>CPRP: {Number(c.cprp).toFixed(2)}</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  {displayOrder.map((key, i) => {
                    const headerMap = { 'Total_Rating': 'NGRP', 'Total_Cost': 'Total Budget' };
                    return <th key={i} style={styles.th}>{headerMap[key] || key}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {(c.details || []).map((row, i) => (
                  <tr key={i}>
                    {displayOrder.map((key, j) => (
                      <td
                        key={j}
                        style={{
                          ...styles.td,
                          textAlign: ['Spots','Slot'].includes(key)
                            ? 'center'
                            : ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'].includes(key)
                            ? 'right'
                            : 'left'
                        }}
                      >
                        {toFixedOrInt(key, row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h3 style={styles.sectionTitle}>Channel Summary with Slot Breakdown</h3>
        <table style={{...styles.table, ...styles.summaryCard}}>
          <thead>
            <tr>
              {summaryOrder.map((key, i) => {
                const headerMap = {
                  'Total_Cost': 'Total Budget','% Cost': 'Budget %','Total_Rating': 'NGRP','% Rating': 'NGRP %',
                  'Prime Cost': 'PT Budget','Non-Prime Cost': 'NPT Budget','Prime Rating': 'PT NGRP','Non-Prime Rating': 'NPT NGRP',
                  'Prime Cost %': 'PT Budget %','Non-Prime Cost %': 'NPT Budget %',
                };
                return <th key={i} style={styles.th}>{headerMap[key] || key}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {(result.channel_summary || []).map((row, i) => (
              <tr key={i}>
                {summaryOrder.map((key, j) => {
                  const isNumeric = typeof row[key] === 'number';
                  return (
                    <td key={j} style={{ ...styles.td, textAlign: isNumeric ? 'right' : 'left' }}>
                      {isNumeric ? Number(row[key]).toFixed(2) : row[key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={handleExportToExcel} style={styles.exportButton}>
          Export Final Plan to Excel
        </button>

        <button onClick={onHome} style={styles.backHomeButton}>
          Go Back to Home
        </button>

        <button type="button" onClick={handleProceedToBonus} disabled={!onProceedToBonus}
          style={{ ...styles.primaryButton, opacity: onProceedToBonus ? 1 : 0.6 }}
        >
          Proceed to Bonus Program Optimization
        </button>
      </div>
    </div>
  );
}