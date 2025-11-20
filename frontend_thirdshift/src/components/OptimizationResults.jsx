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
  onBackToInputs,
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
  setMainOptimizationResult,
  proceedLabel = "Proceed to Bonus Program Optimization" // 👈 default
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
  const desiredOrder = [...displayOrder, "GRP"]; // 🔥 force GRP column

  const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

  /* ---------------------------------------------------------
      1) PROPERTY PROGRAMS SHEET
  --------------------------------------------------------- */
  const propertyRows = [];
  (channels || []).forEach((ch) => {
    const rows = propertyPrograms?.[ch] || [];
    rows.forEach((r) => {
      const name = r.programName ?? r["Name of the program"] ?? "";
      const comName = r.comName ?? r["Com name"] ?? "";
      const day = r.day ?? r.Day ?? "";
      const time = r.time ?? r.Time ?? "";

      const budget = toNum(r.budget ?? r.Budget);
      const duration = toNum(r.duration ?? r.Duration);
      const tvr = toNum(r.tvr ?? r.TVR);
      const spots = parseInt(r.spots ?? r.Spots ?? 0, 10) || 0;

      const ntvr =
        r.ntvr ?? r.NTVR != null
          ? toNum(r.ntvr ?? r.NTVR)
          : (tvr / 30) * duration;

      const ncost =
        r.ncost ?? r.NCost != null
          ? toNum(r.ncost ?? r.NCost)
          : spots > 0
          ? budget / spots
          : 0;

      const ngrp =
        r.ngrp ?? r.NGRP != null
          ? toNum(r.ngrp ?? r.NGRP)
          : ntvr * spots;

      const grp = tvr * spots;

      propertyRows.push({
        Channel: ch,
        "Name of the program": name,
        "Com name": comName,
        Day: day,
        Time: time,
        Budget: budget,
        NCost: ncost,
        Duration: duration,
        TVR: tvr,
        NTVR: ntvr,
        Spots: spots,
        GRP: grp,
        NGRP: ngrp,
      });
    });
  });

  const wsProperty = XLSX.utils.json_to_sheet(propertyRows);
  XLSX.utils.book_append_sheet(workbook, wsProperty, "Property Programs");

  /* ---------------------------------------------------------
      2) COMMERCIAL SHEETS — WITH GRP COLUMN
  --------------------------------------------------------- */
  (result.commercials_summary || []).forEach((c, idx) => {
    const sheetRows = (c.details || []).map((row) => {
      const newRow = {};

      desiredOrder.forEach((key) => {
        if (key === "GRP") {
          newRow["GRP"] = (Number(row.Spots) * Number(row.TVR)).toFixed(2);
        } else {
          const headerMap = { Total_Cost: "Total Budget", Total_Rating: "NGRP" };
          newRow[headerMap[key] || key] = row[key];
        }
      });

      return newRow;
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, ws, `Commercial ${idx + 1}`);
  });

  /* ---------------------------------------------------------
      3) SUMMARY SHEET — INCLUDING GRP AND GRP %
  --------------------------------------------------------- */
  const summaryOrderEx = [
    "Channel",
    "Total_Cost",
    "% Cost",
    "GRP",         // 🔥 added
    "GRP %",       // 🔥 added
    "Total_Rating",
    "% Rating",
    "Prime Cost",
    "Prime Cost %",
    "Non-Prime Cost",
    "Non-Prime Cost %",
    "Prime Rating",
    "Non-Prime Rating",
  ];

  const summaryHeaderMap = {
    Total_Cost: "Total Budget",
    "% Cost": "Budget %",
    Total_Rating: "NGRP",
    "% Rating": "NGRP %",
    "Prime Cost": "PT Budget",
    "Non-Prime Cost": "NPT Budget",
    "Prime Rating": "PT NGRP",
    "Non-Prime Rating": "NPT NGRP",
    "Prime Cost %": "PT Budget %",
    "Non-Prime Cost %": "NPT Budget %",
  };

  const wsSummaryRows = [];

  if (result.channel_summary && result.channel_summary.length > 0) {
    result.channel_summary.forEach((row) => {
      const newRow = {};

      const channelGRP = grpByChannel[row.Channel] || 0;
      const totalGRP = Object.values(grpByChannel).reduce((a, b) => a + b, 0);
      const channelGRPpct = totalGRP > 0 ? (channelGRP / totalGRP) * 100 : 0;

      summaryOrderEx.forEach((key) => {
        if (key === "GRP") newRow["GRP"] = channelGRP.toFixed(2);
        else if (key === "GRP %") newRow["GRP %"] = channelGRPpct.toFixed(2);
        else newRow[summaryHeaderMap[key] || key] = row[key];
      });

      wsSummaryRows.push(newRow);
    });
  }

  const wsSummary = XLSX.utils.json_to_sheet(wsSummaryRows);
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Summary");

  /* ---------------------------------------------------------
      4) FILE SAVE
  --------------------------------------------------------- */
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const fileData = new Blob([excelBuffer], { type: "application/octet-stream" });
  saveAs(fileData, "optimized_schedule.xlsx");
};

    // ---- COMPUTE EXCLUSIVE GRP (without property) ----
    const totalGRP_excl = (result?.commercials_summary || [])
      .flatMap(c => c.details || [])
      .reduce((s, r) => s + (Number(r.Spots || 0) * Number(r.TVR || 0)), 0);

    // ---- COMPUTE INCLUSIVE GRP (includes property GRP) ----
    const totalPropertyGRP = Object.keys(propertyPrograms || {}).reduce((sum, ch) => {
      return sum + (propertyPrograms[ch] || []).reduce((s, r) => {
        const tvr = parseFloat(r.TVR) || 0;
        const spots = parseInt(r.spots) || 0;
        return s + (tvr * spots);
      }, 0);
    }, 0);

    const totalGRP_incl = totalGRP_excl + totalPropertyGRP;

    // ---- GROUP PROGRAM ROWS BY CHANNEL FOR GRP ----
    const programRows = result?.df_result || [];

    const grpByChannel = programRows.reduce((m, r) => {
      const grp = Number(r.Spots || 0) * Number(r.TVR || 0);
      m[r.Channel] = (m[r.Channel] || 0) + grp;
      return m;
    }, {});

    // Total GRP for GRP %
    const totalGRPAllChannels = Object.values(grpByChannel)
      .reduce((a, b) => a + b, 0);


  return (
    <div id="optimization-summary" style={styles.container}>
      <div style={styles.resultContainer}>
        <h3 style={styles.sectionTitle}>Spot Buying Optimization Result</h3>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>Optimized Budget</h4>
            <p style={styles.summaryValue}>{formatLKR(result.total_cost)}</p>
          </div>
          <div style={styles.summaryCard}>
              <h4 style={styles.summaryTitle}>GRP</h4>
              <p style={styles.summaryValue}>{totalGRP_excl.toFixed(2)}</p>
          </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>NGRP</h4>
            <p style={styles.summaryValue}>{Number(result.total_rating).toFixed(2)}</p>
          </div>
          <div style={styles.summaryCard}>
            <h4 style={styles.summaryTitle}>CPRP</h4>
            <p style={styles.summaryValue}>{Number(result.cprp).toFixed(2)}</p>
          </div>
        </div>

        <h3 style={styles.sectionTitle}>Commercial-wise Allocation</h3>
        {(result.commercials_summary || []).map((c, idx) => (
          <div key={idx} style={styles.summaryCard}>
            <h4 style={styles.label}>Commercial {c.commercial_index + 1}</h4>
            <div style={{
              marginBottom: '12px',
              fontSize: '16px',
            }}>
              <strong>Total Budget:</strong> {formatLKR(c.total_cost)}
              &nbsp;   &nbsp;
              <strong>GRP:</strong> {(c.details || []).reduce((s, r) => s + (Number(r.Spots) * Number(r.TVR)), 0).toFixed(2)}
              &nbsp;   &nbsp;
              <strong>NGRP:</strong> {Number(c.total_rating).toFixed(2)}
              &nbsp;  &nbsp;
              <strong>CPRP:</strong> {Number(c.cprp).toFixed(2)}
            </div>
            <table style={styles.table}>
              <thead>
                <tr>
                  {displayOrder.map((key, i) => {
                    const headerMap = { 'Total_Rating': 'NGRP', 'Total_Cost': 'Total Budget' ,'Slot': 'PT [A] / NPT [B]'  };
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
                            : ['Cost','TVR','NCost','NTVR','Total_Cost','GRP','Total_Rating'].includes(key)
                            ? 'right'
                            : 'left'
                        }}
                      >
                        {key === 'GRP'
                          ? (Number(row.Spots) * Number(row.TVR)).toFixed(2)
                          : toFixedOrInt(key, row[key])
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <h3 style={styles.sectionTitle}>Channel wise Summary</h3>

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
                    const channelGRP = grpByChannel[row.Channel] || 0;

                    const totalGRPForPercent = totalGRP_excl + totalPropertyGRP;
                    const channelGRPpct = totalGRPForPercent > 0
                      ? (channelGRP / totalGRPForPercent) * 100
                      : 0;
                  return (
                    <td key={j} style={{ ...styles.td, textAlign: isNumeric ? 'right' : 'left' }}>
                     {key === 'GRP'
                      ? channelGRP.toFixed(2)
                      : key === 'GRP %'
                      ? channelGRPpct.toFixed(2) + '%'
                      : isNumeric
                      ? Number(row[key]).toFixed(2)
                      : row[key]
                    }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={onBackToInputs}
          style={styles.backHomeButton}
        >
          Go Back
        </button>

        <button onClick={handleExportToExcel} style={styles.exportButton}>
          Export Plan to Excel
        </button>

        <button
          type="button"
          onClick={handleProceedToBonus}
          disabled={!onProceedToBonus}
          style={{ ...styles.primaryButton, opacity: onProceedToBonus ? 1 : 0.6 }}
        >
          {proceedLabel}
        </button>
      </div>
    </div>
  );
}