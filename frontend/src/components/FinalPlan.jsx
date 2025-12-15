// src/components/FinalPlan.jsx
import React, { useMemo , useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import ExcelJS from 'exceljs';

const hostname = window.location.hostname;
const isLocal =
  hostname.includes("localhost") || hostname.includes("127.");

const API_BASE = isLocal
  ? "http://localhost:5000"
  : "https://optwebapp-production.up.railway.app";

export default function FinalPlan({
  // Accept BOTH naming styles so App.js doesn't have to change
  mainResults: _mainResults,
  bonusResults: _bonusResults,
  benefitResults: _benefitResults,
  basePlanResult,
  bonusResult,
  totalBudgetInclProperty,
  propertyPrograms = {},
  styles = {},
  formatLKR = (v) =>
    `LKR ${Number(v ?? 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`,
  formatLKR_1 = (v) =>
    `${Number(v ?? 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`,
  selectedTG = "",
  optimizationInput,
  sessionSnapshot = {},   // 🌟 NEW
  onHome,
}) {

  // ---- Normalize inputs (support both prop name styles) ----
  const mainResults = _mainResults || basePlanResult || {};
  const bonusResults = _bonusResults || bonusResult || {};
  const benefitResults = _benefitResults || {};
  const commercialDurations = optimizationInput?.durations || {};



      useEffect(() => {
      console.log("🚀 FinalPlan props check");
      console.log("mainResults", mainResults);
      console.log("bonusResults", bonusResults);
      console.log("benefitResults", benefitResults);
    }, [mainResults, bonusResults, benefitResults]);

  // ---------- Helpers ----------
  const num = (v, d = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : d;
  };
  const toStr = (v) => (v == null ? '' : String(v));
  const safeFx = (v, d = 2) => (Number.isFinite(+v) ? (+v).toFixed(d) : (0).toFixed(d));

     // put near your other helpers
    const normalizeCommercial = (raw, { zeroBasedNumeric = false } = {}) => {
      const s = toStr(raw).trim();
      if (!s) return 'COM_1';

      // COM_# or variants -> keep the number as-is
      const mCom = s.match(/^COM[_\s-]?(\d+)$/i);
      if (mCom) return `COM_${parseInt(mCom[1], 10)}`;

      // pure number -> choose 0-based vs 1-based semantics
      if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        return `COM_${zeroBasedNumeric ? n + 1 : n}`;
      }

      // any other text with a number inside -> take that number as-is
      const m = s.match(/(\d+)/);
      if (m) return `COM_${parseInt(m[1], 10)}`;

      // fallback (rare)
      return s.toUpperCase();
    };
    const moneyCell = (v) =>
      Number(v ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const monthName = (mm) => {
      return new Date(2000, parseInt(mm)-1).toLocaleString("en-US", { month: "short" });
    };

    // In FinalPlan.jsx - add this near the top with other helpers
    const TG_MAPPING = {
      "tvr_all": "All TG",
      "tvr_abc_15_90": "SEC ABC | Age 15-90",
      "tvr_abc_30_60": "SEC ABC | Age 30-60",
      "tvr_abc_15_30": "SEC ABC | Age 15-30",
      "tvr_abc_20_plus": "SEC ABC | Age 20+",
      "tvr_ab_15_plus": "SEC AB | Age 15+",
      "tvr_cd_15_plus": "SEC CD | Age 15+",
      "tvr_ab_female_15_45": "SEC AB | Female Age 15-45",
      "tvr_abc_15_60": "SEC ABC | Age 15-60",
      "tvr_bcde_15_plus": "SEC BCDE | Age 15+",
      "tvr_abcde_15_plus": "SEC ABCDE | Age 15+",
      "tvr_abc_female_15_60": "SEC ABC | Female Age 15-60",
      "tvr_abc_male_15_60": "SEC ABC | Male Age 15-60"
    };

    const getTGLabel = (tgKey) => TG_MAPPING[tgKey] || tgKey || 'Not specified';

  // ---------- Tables ----------
  // Main tables from optimization results
  const mainByProgram  = useMemo(() => {
    // Try multiple sources for main program data
    return mainResults?.tables?.by_program ||
           mainResults?.df_result ||
           [];
  }, [mainResults]);

  const mainByChannel  = useMemo(() => {
    return mainResults?.tables?.by_channel ||
           mainResults?.channel_summary ||
           [];
  }, [mainResults]);

  // Main commercials summary from optimization results
  const mainCommercialsSummary = useMemo(() => {
    return mainResults?.commercials_summary || [];
  }, [mainResults]);

  // Bonus tables
  const bonusByProgram = useMemo(() => bonusResults?.tables?.by_program || [], [bonusResults]);
  const bonusByChannel = useMemo(() => bonusResults?.tables?.by_channel || [], [bonusResults]);

  // Benefit tables
  const benefitByProgram = useMemo(() => benefitResults?.tables?.by_program || [], [benefitResults]);
  const benefitByChannel = useMemo(() => benefitResults?.tables?.by_channel || [], [benefitResults]);

    // Group benefit programs by commercial
    const benefitCommercialData = useMemo(() => {
      const commercialMap = {};

      const benefitCommSummary =
        benefitResults?.commercials_summary ||
        benefitResults?.final?.commercials_summary ||
        [];

      if (benefitCommSummary.length > 0) {
        // ✅ Use commercials_summary if present
        benefitCommSummary.forEach((commercial, index) => {
          const baseIdx = Number.isFinite(+commercial?.commercial_index)
            ? +commercial.commercial_index
            : index;
          const commercialKey = `COM_${baseIdx + 1}`;
          commercialMap[commercialKey] = {
            commercial_index: commercial.commercial_index,
            total_cost: commercial.total_cost,
            total_rating: commercial.total_rating,
            cprp: commercial.cprp,
            programs: commercial.details || [],
          };
        });
      } else {
        // fallback: group by_program
        (benefitResults?.tables?.by_program || []).forEach((r) => {
          const c = normalizeCommercial(
            r.Commercial ?? r.commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',
            { zeroBasedNumeric: false }
          );
          if (!commercialMap[c]) {
            commercialMap[c] = {
              programs: [],
              total_rating: 0,
            };
          }
          commercialMap[c].programs.push(r);
          commercialMap[c].total_rating += num(r.Total_Rating ?? r.Total_NTVR);
        });
      }

      return commercialMap;
    }, [benefitResults]);


  // ---------- Budget (unchanged) ----------
  // Prefer prop; else try main totals; else fallback to sum of main channel costs
  const budgetInclProperty = useMemo(() => {
    if (Number.isFinite(+totalBudgetInclProperty)) return +totalBudgetInclProperty;
    const t =
      mainResults?.inclusiveTotals?.totalBudgetIncl ??
      mainResults?.totals?.total_budget_incl_property ??
      mainResults?.totals?.total_cost_incl_property ??
      mainResults?.total_cost;
    if (Number.isFinite(+t)) return +t;
    const sum = (mainByChannel || []).reduce((a, r) => a + num(r.Total_Cost), 0);
    return sum;
  }, [totalBudgetInclProperty, mainResults, mainByChannel]);

  // ---------- NGRP (main, incl. property) ----------
  const mainNGRP = useMemo(() => {
    const t =
      mainResults?.inclusiveTotals?.totalNGRPIncl ??
      mainResults?.totals?.total_rating_incl_property ??
      mainResults?.totals?.total_rating ??
      mainResults?.total_rating;
    if (Number.isFinite(+t)) return +t;
    const ch = mainByChannel.reduce((a, r) => a + num(r.Total_Rating), 0);
    if (ch > 0) return ch;
    return mainByProgram.reduce((a, r) => a + num(r.Total_Rating), 0);
  }, [mainResults, mainByChannel, mainByProgram]);

  const mainCPRP = useMemo(
    () => (mainNGRP > 0 ? budgetInclProperty / mainNGRP : 0),
    [budgetInclProperty, mainNGRP]
  );

    // ---------- Property Program Details (flat, sorted by Channel) ----------
    const flatPropertyPrograms = useMemo(() => {
      const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
      const toInt = (v) => (isNaN(parseInt(v, 10)) ? 0 : parseInt(v, 10));

      const rows = [];
      Object.entries(propertyPrograms || {}).forEach(([ch, arr]) => {
        (arr || []).forEach((r) => {
          const name     = r.programName ?? r['Name of the program'] ?? '';
          const comName  = r.comName ?? r['Com name'] ?? r.ComName ?? r['Com Name'] ?? '';
          const day      = r.day ?? r.Day ?? '';
          const time     = r.time ?? r.Time ?? '';
          const budget   = toNum(r.budget ?? r.Budget);
          const duration = toNum(r.duration ?? r.Duration);
          const tvr      = toNum(r.tvr ?? r.TVR);
          const spots    = toInt(r.spots ?? r.Spots);

          // Derive if missing
          const ntvr  = (r.ntvr ?? r.NTVR) != null ? toNum(r.ntvr ?? r.NTVR) : (tvr / 30) * duration;
          const ncost = (r.ncost ?? r.NCost) != null ? toNum(r.ncost ?? r.NCost) : (spots > 0 ? budget / spots : 0);
          const ngrp  = (r.ngrp ?? r.NGRP) != null ? toNum(r.ngrp ?? r.NGRP) : (ntvr * spots);

          rows.push({
            Channel: String(ch),
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
            Language: r.language ?? r.Language ?? "",
            PTNPT: r.pt_npt ?? r.ptnpt ?? r['PT / NPT'] ?? "",
              // ⭐ NEW FIELDS YOU ADDED IN PROPERTY EDITOR ⭐
              RateCardCost: toNum(r.rateCardCost ?? r.RateCardCost ?? 0),
              RateCardTotal: toNum(r.rateCardTotal ?? r.RateCardTotal ?? 0),
              TotalBudget: toNum(r.totalBudget ?? r.TotalBudget ?? budget), // same as On Cost
              TotalSaving: toNum(r.totalSaving ?? r.TotalSaving ?? 0),
              CPRP: toNum(r.cprp ?? r.CPRP ?? (ngrp > 0 ? budget / ngrp : 0)),
          });
        });
      });

      rows.sort((a, b) => a.Channel.localeCompare(b.Channel));
      return rows;
    }, [propertyPrograms]);

    const propertyTotals = useMemo(() => {
      const budget = (flatPropertyPrograms || []).reduce((a, r) => a + num(r.Budget), 0);
      const ngrp   = (flatPropertyPrograms || []).reduce((a, r) => a + num(r.NGRP), 0);
      const cprp   = ngrp > 0 ? budget / ngrp : 0;
      return { budget, ngrp, cprp };
    }, [flatPropertyPrograms]);

    // Add benefit NGRP into Property NGRP
    const benefitNGRPTotal = useMemo(() => {
      return Object.values(benefitCommercialData || {}).reduce(
        (sum, com) => sum + num(com.total_rating),
        0
      );
    }, [benefitCommercialData]);

    const propertyNGRP_InclBenefit = useMemo(() => {
      return (propertyTotals?.ngrp || 0) + benefitNGRPTotal;
    }, [propertyTotals, benefitNGRPTotal]);


  // ---------- Bonus totals ----------
  const bonusNGRP = useMemo(() => {
    const t = num(bonusResults?.totals?.bonus_total_rating);
    if (t > 0) return t;
    const ch = bonusByChannel.reduce((a, r) => a + num(r.Total_Rating), 0);
    if (ch > 0) return ch;
    return bonusByProgram.reduce((a, r) => a + num(r.Total_Rating), 0);
  }, [bonusResults, bonusByChannel, bonusByProgram]);

  // ---------- Combined ----------
  const combinedNGRP = useMemo(() => mainNGRP + bonusNGRP, [mainNGRP, bonusNGRP]);
  const combinedCPRP = useMemo(
    () => (combinedNGRP > 0 ? budgetInclProperty / combinedNGRP : 0),
    [budgetInclProperty, combinedNGRP]
  );

  // ---------- Combined Commercial Allocation (Main + Bonus) ----------
  // First, process main commercials from optimization results
  const mainCommercialData = useMemo(() => {
    const commercialMap = {};

    // If we have commercials_summary, use that
    if (mainCommercialsSummary && mainCommercialsSummary.length > 0) {
      mainCommercialsSummary.forEach((commercial, index) => {
        const baseIdx = Number.isFinite(+commercial?.commercial_index)
        ? +commercial.commercial_index
        : index; // server is 0-based; make it 1-based for display
        const commercialKey = `COM_${baseIdx + 1}`;
        commercialMap[commercialKey] = {
          commercial_index: commercial.commercial_index,
          total_cost: commercial.total_cost,
          total_rating: commercial.total_rating,
          cprp: commercial.cprp,
          details: commercial.details || [],
          programs: commercial.details || []
        };
      });
    } else {
      // Fallback: group mainByProgram by Commercial field
      const grouped = {};
      mainByProgram.forEach((r) => {
        const c = normalizeCommercial(r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',{ zeroBasedNumeric: true });
        if (!grouped[c]) {
          grouped[c] = {
            programs: [],
            total_cost: 0,
            total_rating: 0
          };
        }
        grouped[c].programs.push(r);
        grouped[c].total_cost += num(r.Total_Cost);
        grouped[c].total_rating += num(r.Total_Rating);
      });

      Object.entries(grouped).forEach(([key, data]) => {
        commercialMap[key] = {
          commercial_index: parseInt(key.split('_')[1]) - 1,
          total_cost: data.total_cost,
          total_rating: data.total_rating,
          cprp: data.total_rating > 0 ? data.total_cost / data.total_rating : 0,
          details: data.programs,
          programs: data.programs
        };
      });
    }

    return commercialMap;
  }, [mainCommercialsSummary, mainByProgram]);

  // Group bonus programs by commercial
  const bonusCommercialData = useMemo(() => {
    const commercialMap = {};
    bonusByProgram.forEach((r) => {
     const c = normalizeCommercial(r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',{ zeroBasedNumeric: false });
      if (!commercialMap[c]) {
        commercialMap[c] = {
          programs: [],
          total_rating: 0
        };
      }
      commercialMap[c].programs.push(r);
      commercialMap[c].total_rating += num(r.Total_Rating ?? r.Total_NTVR);
    });
    return commercialMap;
  }, [bonusByProgram]);

  // Get all commercial keys (main + bonus)
  const allCommercialKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(mainCommercialData),
      ...Object.keys(benefitCommercialData),
      ...Object.keys(bonusCommercialData)
    ]);

    const filtered = Array.from(keys).filter(key =>
      key.startsWith('COM_') || key.toUpperCase().startsWith('COM_')
    );

    filtered.sort((a, b) => {
      const ai = num(a.split('_')[1], 1e9);
      const bi = num(b.split('_')[1], 1e9);
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });

    return filtered;
  }, [mainCommercialData, benefitCommercialData, bonusCommercialData]);

  // After building mainCommercialData / benefitCommercialData / bonusCommercialData
    useEffect(() => {
      const inspect = (name, m) => {
        const keys = Object.keys(m || {});
        console.log(`[DBG] ${name} keys:`, keys);
        if (keys[0]) {
          const first = m[keys[0]];
          console.log(`[DBG] ${name} sample[${keys[0]}]:`, {
            programs_len: first?.programs?.length,
            total_cost: first?.total_cost,
            total_rating: first?.total_rating,
          });
          if (Array.isArray(first?.programs) && first.programs[0]) {
            const r = first.programs[0];
            console.log(`[DBG] ${name} sample row fields:`, Object.keys(r));
          }
        }
      };

      inspect('mainCommercialData', mainCommercialData);
      inspect('benefitCommercialData', benefitCommercialData);
      inspect('bonusCommercialData', bonusCommercialData);
      console.log('[DBG] allCommercialKeys:', allCommercialKeys);
    }, [mainCommercialData, benefitCommercialData, bonusCommercialData, allCommercialKeys]);


  // ---------- Channel summary incl. bonus ----------
  const bonusNGRPByChannel = useMemo(() => {
    const m = {};
    bonusByChannel.forEach((r) => {
      const ch = toStr(r.Channel);
      m[ch] = (m[ch] || 0) + num(r.Total_Rating);
    });
    return m;
  }, [bonusByChannel]);


  const channelSummaryInclBonus = useMemo(() => {
    const rows = (mainByChannel || []).map((r) => {
      const ch = toStr(r.Channel);
      const budget = num(r.Total_Cost); // unchanged
      const ngrpm  = num(r.Total_Rating);
      const ngrpb  = num(bonusNGRPByChannel[ch]);
      return {
        Channel: ch,
        Slot: toStr(r.Slot),
        Spots: num(r.Spots),
        Total_Cost: budget,
        NGRP_Main: ngrpm,
        NGRP_Bonus: ngrpb,
        NGRP_Incl_Bonus: ngrpm + ngrpb,
      };
    });
    return rows;
  }, [mainByChannel, bonusNGRPByChannel]);

  // ---------- Final summary table ----------
  const finalSummaryRows = useMemo(() => {
    // budget unchanged from main; NGRP = main + bonus by channel; CPRP = budget / ngrp_with_bonus
    const idxMainBudget = new Map((mainByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Cost)]));
    const idxMainNgrp   = new Map((mainByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Rating)]));
    const idxBonusNgrp  = new Map((bonusByChannel || []).map((r) => [toStr(r.Channel), num(r.Total_Rating)]));
    const allCh = new Set([
      ...Array.from(idxMainBudget.keys()),
      ...Array.from(idxMainNgrp.keys()),
      ...Array.from(idxBonusNgrp.keys()),
    ]);
    return Array.from(allCh).sort().map((ch) => {
      const budget = idxMainBudget.get(ch) ?? 0;
      const ngrpm  = idxMainNgrp.get(ch) ?? 0;
      const ngrpb  = idxBonusNgrp.get(ch) ?? 0;
      const ngrpt  = ngrpm + ngrpb;
      const cprp   = ngrpt > 0 ? budget / ngrpt : 0;
      return { Channel: ch, Total_Budget: budget, NGRP_With_Bonus: ngrpt, CPRP: cprp };
    });
  }, [mainByChannel, bonusByChannel]);

      // Spot-only NGRP from main optimization tables (excludes Property & Bonus)
    const mainSpotNGRP = useMemo(() => {
      const ch = (mainByChannel || []).reduce((a, r) => a + num(r.Total_Rating), 0);
      if (ch > 0) return ch;
      return (mainByProgram || []).reduce((a, r) => a + num(r.Total_Rating), 0);
    }, [mainByChannel, mainByProgram]);

    // Total NGRP including Property + Bonus
    const totalNGRP_InclPropertyBonus = useMemo(
      () => mainSpotNGRP + propertyNGRP_InclBenefit + (bonusNGRP || 0),
      [mainSpotNGRP, propertyNGRP_InclBenefit, bonusNGRP]
    );

    // === NEW: GRP calculations ===

    // Spot-only GRP (TVR * Spots from main optimization)
    const mainSpotGRP = useMemo(() => {
      return (mainByProgram || []).reduce((a, r) => {
        const tvr = num(r.TVR ?? r.NTVR ?? 0);
        const spots = num(r.Spots ?? 0);
        return a + tvr * spots;
      }, 0);
    }, [mainByProgram]);


// Property GRP = Manual Property GRP + Benefit GRP
const propertyGRPTotal = useMemo(() => {
  const manualGRP = (flatPropertyPrograms || []).reduce((a, r) => {
    const tvr = num(r.TVR ?? 0);
    const spots = num(r.Spots ?? 0);
    return a + tvr * spots;
  }, 0);

  const benefitGRP = Object.values(benefitCommercialData || {}).reduce(
    (sum, com) => {
      const programs = com.programs || [];
      return (
        sum +
        programs.reduce((x, p) => {
          const tvr = num(p.TVR ?? p.NTVR ?? 0);
          const spots = num(p.Spots ?? 0);
          return x + tvr * spots;
        }, 0)
      );
    },
    0
  );

  return manualGRP + benefitGRP;
}, [flatPropertyPrograms, benefitCommercialData]);


    // Bonus GRP
    const bonusGRP = useMemo(() => {
      return (bonusByProgram || []).reduce((a, r) => {
        const tvr = num(r.TVR ?? r.NTVR ?? 0);
        const spots = num(r.Spots ?? 0);
        return a + tvr * spots;
      }, 0);
    }, [bonusByProgram]);

    // Total GRP (spot + property + bonus)
    const totalGRP_InclPropertyBonus = useMemo(
      () => mainSpotGRP + propertyGRPTotal + bonusGRP,
      [mainSpotGRP, propertyGRPTotal, bonusGRP]
    );



    // CPRP using (Budget incl. Property) / (NGRP incl. Property + Bonus)
    const cprp_InclPropertyBonus = useMemo(
      () => (totalNGRP_InclPropertyBonus > 0 ? budgetInclProperty / totalNGRP_InclPropertyBonus : 0),
      [budgetInclProperty, totalNGRP_InclPropertyBonus]
    );


        // ---------- Per-channel Property & Combined summary ----------
    const propertyByChannel = useMemo(() => {
      const budgetByCh = {};
      const ngrpByCh = {};

      // Manual property programs
      (flatPropertyPrograms || []).forEach((r) => {
        const ch = toStr(r.Channel);
        budgetByCh[ch] = (budgetByCh[ch] || 0) + num(r.Budget);
        ngrpByCh[ch]   = (ngrpByCh[ch]   || 0) + num(r.NGRP);
      });

      // ✅ Add benefit programs on top
      Object.values(benefitCommercialData || {}).forEach((com) => {
        (com.programs || []).forEach((r) => {
          const ch = toStr(r.Channel);
          const cost = num(r.Total_Cost ?? r.Cost ?? r.NCost ?? 0);
          const ngrp = num(r.Total_Rating ?? r.NGRP ?? r.Total_NTVR ?? 0);

          budgetByCh[ch] = (budgetByCh[ch] || 0) + cost;
          ngrpByCh[ch]   = (ngrpByCh[ch]   || 0) + ngrp;
        });
      });

      console.log("[DBG] propertyByChannel incl. benefit", { budgetByCh, ngrpByCh });

      return { budgetByCh, ngrpByCh };
    }, [flatPropertyPrograms, benefitCommercialData]);

    const mainCostByCh = useMemo(() => {
      const m = new Map();
      (mainByChannel || []).forEach((r) => m.set(toStr(r.Channel), num(r.Total_Cost)));
      return m;
    }, [mainByChannel]);

    const mainNGRPByCh = useMemo(() => {
      const m = new Map();
      (mainByChannel || []).forEach((r) => m.set(toStr(r.Channel), num(r.Total_Rating)));
      return m;
    }, [mainByChannel]);

    const combinedChannelRows = useMemo(() => {
      const allCh = new Set([
        ...Array.from(mainCostByCh.keys()),
        ...Object.keys(propertyByChannel.budgetByCh || {}),
        ...Object.keys(bonusNGRPByChannel || {}),
      ]);

      return Array.from(allCh).sort().map((ch) => {
        const costSpot    = mainCostByCh.get(ch) ?? 0;                                // Cost (LKR) Excl. property
        const propVal     = propertyByChannel.budgetByCh?.[ch] ?? 0;                  // Property value (LKR)
        const totalCost   = costSpot + propVal;                                       // Total Cost (incl. property)

        const ngrpSpot    = mainNGRPByCh.get(ch) ?? 0;                                // NGRP (Spot Buying)
        const ngrpProp    = propertyByChannel.ngrpByCh?.[ch] ?? 0;                    // NGRP (Property)
        const ngrpBonus   = bonusNGRPByChannel?.[ch] ?? 0;                            // Bonus NGRP
        const ngrpTotal   = ngrpSpot + ngrpProp + ngrpBonus;                          // Total NGRP

        const cprp        = ngrpTotal > 0 ? totalCost / ngrpTotal : 0;                // CPRP (LKR)

        // --- NEW GRP calculations per channel ---
        const grpSpot = (mainByProgram || [])
          .filter(r => toStr(r.Channel) === ch)
          .reduce((a, r) => a + num(r.TVR ?? 0) * num(r.Spots ?? 0), 0);

        // Manual Property GRP
        const grpProperty_manual = (flatPropertyPrograms || [])
          .filter(r => toStr(r.Channel) === ch)
          .reduce((a, r) => a + num(r.TVR ?? 0) * num(r.Spots ?? 0), 0);

        // Benefit GRP for this channel
        const grpProperty_benefit = Object.values(benefitCommercialData || {})
          .flatMap(com => com.programs || [])
          .filter(p => toStr(p.Channel) === ch)
          .reduce((a, p) => a + num(p.TVR ?? p.NTVR ?? 0) * num(p.Spots ?? 0), 0);

        // Combined Property GRP (manual + benefit)
        const grpProperty = grpProperty_manual + grpProperty_benefit;

        const grpBonus = (bonusByProgram || [])
          .filter(r => toStr(r.Channel) === ch)
          .reduce((a, r) => a + num(r.TVR ?? 0) * num(r.Spots ?? 0), 0);

        const grpTotal = grpSpot + grpProperty + grpBonus;

        // return object
        return {
          Channel: ch,
          Cost_LKR: costSpot,
          Property_LKR: propVal,
          TotalCost_LKR: totalCost,
          NGRP_Spot: ngrpSpot,
          NGRP_Property: ngrpProp,
          NGRP_Bonus: ngrpBonus,
          NGRP_Total: ngrpTotal,
          GRP_Spot: grpSpot,
          GRP_Property: grpProperty,
          GRP_Bonus: grpBonus,
          GRP_Total: grpTotal,
          CPRP_LKR: cprp,
        };
      });
    }, [mainCostByCh, mainNGRPByCh, propertyByChannel, bonusNGRPByChannel]);

    // --- TEMP: console print of Final Plan rows (MAIN + BONUS, excluding property from BONUS only) ---
    useEffect(() => {
      // Build a key for property exclusion (no normalization)
      const keyOf = (r) => [
        toStr(r.Channel),
        toStr(r.Program ?? r['Name of the program'] ?? ''),
        toStr(r.Day ?? r.Date ?? ''),
        toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
      ].join('||').toLowerCase();

      // Property rows -> keys we will use to exclude only from BONUS
      const propertyKeys = new Set(
        (flatPropertyPrograms || []).map((r) => [
          toStr(r.Channel),
          toStr(r['Name of the program'] ?? r.Program ?? ''),
          toStr(r.Day ?? ''),
          toStr(r.Time ?? ''),
        ].join('||').toLowerCase())
      );

      // Per-identity counters to guarantee uniqueness even if identical rows appear
      const counters = new Map();
      const nextUniq = (k) => {
        const n = (counters.get(k) ?? 0) + 1;
        counters.set(k, n);
        return n;
      };

      // ---------- MAIN rows (keep ALL; do NOT exclude by property) ----------
      const mainRows = (mainByProgram || []).map((r) => {
        // main results usually 0-based -> normalizeCommercial(..., { zeroBasedNumeric: true })
        const commercial = normalizeCommercial(
          r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',
          { zeroBasedNumeric: true }
        );

        const identityKey = [
          'main',
          commercial,
          keyOf(r),
          num(r.Spots ?? 0),
        ].join('|');

        const uniq = nextUniq(identityKey);

        const id =
          r.id ?? r._id ?? r.ID ?? r.Id ??
          r.row_id ?? r.RowId ?? r.rowId ??
          `${identityKey}#${uniq}`;

        return {
          id,
          commercial,
          channel: toStr(r.Channel),
          day: toStr(r.Day ?? r.Date ?? ''),
          time: toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
          spots: num(r.Spots ?? 0),
          source: 'main',
        };
      });

      // ---------- BONUS rows (exclude property overlaps) ----------
      const bonusRows = (bonusByProgram || [])
        .filter((r) => !propertyKeys.has(keyOf(r)))
        .map((r) => {
          // bonus often 1-based in UI/files -> normalizeCommercial(..., { zeroBasedNumeric: false })
          const commercial = normalizeCommercial(
            r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',
            { zeroBasedNumeric: false }
          );

          const identityKey = [
            'bonus',
            commercial,
            keyOf(r),
            num(r.Spots ?? 0),
          ].join('|');

          const uniq = nextUniq(identityKey);

          const id =
            r.id ?? r._id ?? r.ID ?? r.Id ??
            r.row_id ?? r.RowId ?? r.rowId ??
            `${identityKey}#${uniq}`;

          return {
            id,
            commercial,
            channel: toStr(r.Channel),
            day: toStr(r.Day ?? r.Date ?? ''),
            time: toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
            spots: num(r.Spots ?? 0),
            source: 'bonus',
          };
        });

      const out = [...mainRows, ...bonusRows];

      console.log('Final Plan rows (MAIN + BONUS, property excluded from BONUS only):', out);
      console.table(out, ['id', 'commercial', 'channel', 'day', 'time', 'spots', 'source']);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      // fixed-size deps: re-run when counts change (e.g., bonus arrives)
      (mainByProgram || []).length,
      (bonusByProgram || []).length,
      (flatPropertyPrograms || []).length,
    ]);

    // ---------- Export ----------
    const handleExport = async (useFormulas = false) => {

    const removeGridlines = (ws) => {
      const MAX_ROWS = 300;   // safe full-page fill
      const MAX_COLS = 50;    // up to column AX

      for (let r = 1; r <= MAX_ROWS; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= MAX_COLS; c++) {
          const cell = row.getCell(c);

          // only set white background if cell doesn't already have fill
          if (!cell.fill) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFF' }
            };
          }
        }
      }
    };

      const workbook = new ExcelJS.Workbook();

      // ---------- Build KPI sheet ----------
      const mainSpotNGRP = (mainByChannel || []).reduce((a, r) => a + num(r.Total_Rating), 0)
                          || (mainByProgram || []).reduce((a, r) => a + num(r.Total_Rating), 0);

      const propertyBudgetTotal = (flatPropertyPrograms || []).reduce((a, r) => a + num(r.Budget), 0);
      const propertyNGRPTotal = propertyNGRP_InclBenefit;

      const totalNGRP_InclPropertyBonus = mainSpotNGRP + propertyNGRPTotal + bonusNGRP;
      const cprp_InclPropertyBonus = totalNGRP_InclPropertyBonus > 0
        ? budgetInclProperty / totalNGRP_InclPropertyBonus
        : 0;

      const kpiRows = [
        { Metric: 'Total Budget', Value: budgetInclProperty },
        { Metric: 'Spot Buying GRP', Value: mainSpotGRP },
        { Metric: 'Property GRP', Value: propertyGRPTotal },
        { Metric: 'Bonus GRP', Value: bonusGRP },
        { Metric: 'Total GRP', Value: totalGRP_InclPropertyBonus },
        { Metric: 'Spot Buying NGRP', Value: mainSpotNGRP },
        { Metric: 'Property NGRP ', Value: propertyNGRP_InclBenefit },
        { Metric: 'Bonus NGRP', Value: bonusNGRP },
        { Metric: 'Total NGRP', Value: totalNGRP_InclPropertyBonus },
        { Metric: 'CPRP', Value: cprp_InclPropertyBonus },
      ];

        const kpiSheet = workbook.addWorksheet('Final KPIs');


        // --- Add header ---
        const header = kpiSheet.addRow(['KPI', 'Value']);

        // --- Header styling (Light Excel Green + bold) ---
        header.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'C6EFCE' }   // light Excel green
          };
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });

        // --- Add KPI rows ---
        kpiRows.forEach((row) => {
          const r = kpiSheet.addRow([row.Metric, row.Value]);

          r.height = 20;

          r.eachCell((cell) => {
            cell.alignment = {
              wrapText: true,
              vertical: 'middle'
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        });



        removeGridlines(kpiSheet);
        // --- Auto-fit Metric column width ---
        let maxMetricLen = 0;
        kpiRows.forEach((r) => {
          if (r.Metric.length > maxMetricLen) maxMetricLen = r.Metric.length;
        });

        kpiSheet.getColumn(1).width = Math.min(Math.max(maxMetricLen * 1.2, 20), 50);

        // Value column width
        kpiSheet.getColumn(2).width = 20;

      // ---------- Channel list ----------
        // ---------- Channel list (FIXED!) ----------
        const channelSet = new Set();

        // Main
        (mainByChannel || []).forEach(r => channelSet.add(toStr(r.Channel)));

        // Property
        (flatPropertyPrograms || []).forEach(r => channelSet.add(toStr(r.Channel)));

        // Bonus
        (bonusByProgram || []).forEach(r => channelSet.add(toStr(r.Channel)));

        // Benefit programs (this was missing!)
        Object.values(benefitCommercialData || {}).forEach(commercial => {
          (commercial.programs || []).forEach(r => {
            channelSet.add(toStr(r.Channel));
          });
        });

        const channelList = Array.from(channelSet)
          .filter(ch => ch && ch.trim() !== '')
          .sort((a, b) => a.localeCompare(b));

      // ---------- Headers ----------
    const propertyHeaders = [
      'Program',
      'Commercial name',
      'Duration',
      'Language',
      'Day',
      'Time',
      'A - PT/B - NPT',
      'Rate Card Value',
      'Negotiated Value',
      'Rate Card Total',
      'Total Budget',
      'Total Saving',
      'TVR',
      'NTVR',
      'GRP',
      'NGRP',
      'CPRP',
      'Spots'
    ];

    const progHeaders = [
      'Program',
      'Com name',
      'Duration',
      'Language',
      'Day',
      'Time',
      'PT [A] / NPT [B]',
      'Nrate',
      'NCost (LKR)',
      'Rate Card Total (LKR)',
      'Total Budget (LKR)',
      'Total Saving (LKR)',
      'TVR',
      'NTVR',
      'GRP',
      'NGRP',
      'CPRP',
      'Spots'
    ];


      // Merge helper for export (always merge benefit into main)
      const mergeProgramsForExport = (mainRows, benefitRows) => {
        const subKey = (r) => [
          toStr(r.Program),
          toStr(r.Day ?? r.Date ?? ''),
          toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
          toStr(r.Slot ?? 'A')
        ].join('||').toLowerCase();

        const mainMap = new Map();
        mainRows.forEach(r => {
          const k = subKey(r);
          mainMap.set(k, (mainMap.get(k) || []).concat(r));
        });

        const unmatchedBenefit = [];
        benefitRows.forEach(r => {
          const k = subKey(r);
          if (mainMap.has(k)) {
            mainMap.set(k, mainMap.get(k).concat(r));
          } else {
            unmatchedBenefit.push(r);
          }
        });

        const mergedMainRows = [];
        mainMap.forEach((rows, k) => {
          if (rows.length === 1) {
            mergedMainRows.push(rows[0]);
          } else {
            const first = rows[0];
            const spots = rows.reduce((a, rr) => a + num(rr.Spots ?? 0), 0);
            const totalCost = rows.reduce((a, rr) => a + num(rr.Total_Cost ?? 0), 0);
            const totalRating = rows.reduce((a, rr) => a + num(rr.Total_Rating ?? rr.Total_NTVR ?? 0), 0);
            const merged = {
              ...first,
              Spots: spots,
              Total_Cost: totalCost,
              Total_Rating: totalRating,
            };
            mergedMainRows.push(merged);
          }
        });

        // Combine merged main + unmatched benefit, then sort by Slot (A before B)
        const allNonBonusRows = [...mergedMainRows, ...unmatchedBenefit];
        allNonBonusRows.sort((a, b) => {
          const slotA = toStr(a.Slot ?? 'A').toUpperCase();
          const slotB = toStr(b.Slot ?? 'A').toUpperCase();
          if (slotA === 'A' && slotB === 'B') return -1;
          if (slotA === 'B' && slotB === 'A') return 1;
          return 0;
        });

        return allNonBonusRows;
      };

      // ---------- Build per-channel sheets ----------
      channelList.forEach((ch) => {
            console.log(`[DEBUG] Processing channel: ${ch}`); // ADD THIS
            const sheetTitle = `${ch}`.substring(0, 31); // Excel sheet name limit
            const worksheet = workbook.addWorksheet(sheetTitle);

            // ====================== TOP DETAIL SECTION (Start from Column B) ======================
            const topRows = [
              ["", "Client :", clientName],
              ["", "Activity :", activity],
              ["", "Brand :", brandName],
              ["", "Campaign :", campaign],
              ["", "Target Group :", getTGLabel(selectedTG)],
              ["", "TV Budget :", tvBudget ? Number(tvBudget) : ""],
              ["", "Duration :", durationName],
              ["", "Activation Period :", `${fromDate}  to  ${toDate}`],
              ["", "Ref No :", refNo],
            ];

            topRows.forEach((r) => worksheet.addRow(r));
            worksheet.addRow([]); // spacer row

            // ---------------------- Styling ----------------------
            for (let i = 1; i <= worksheet.rowCount; i++) {
              const row = worksheet.getRow(i);
              const colB = row.getCell(2); // Label
              const colC = row.getCell(3); // Value

              // Stop at spacer row
              if (!colB.value) break;

              // LABELS (Column B) — bold + right aligned
              colB.font = { bold: false };
              colB.alignment = {
                horizontal: 'right',
                vertical: 'middle'
              };

              // VALUES (Column C) — bold + right aligned
              colC.font = { bold: true };
              colC.alignment = {
                vertical: 'middle'
              };
            }

            // Column width optimization
            worksheet.getColumn(1).width = 2;   // empty spacer
            worksheet.getColumn(2).width =50;//abel column
            worksheet.getColumn(3).width = 50;  // value column

        // ================== DATE RANGE ROW ===================
        // Build date listno
        const dateList = [];
        let d = new Date(fromDate);
        const endDate = new Date(toDate);
        while (d <= endDate) {
          dateList.push(fmtDate(d));
          d.setDate(d.getDate() + 1);
        }

        const OFFSET = propertyHeaders.length;
        const empty = Array(OFFSET).fill("");

        // --- 3 header rows ---
        const rowMonth = [];
        const rowDay   = [];
        const rowDate  = [];

        for (let i = 1; i <= OFFSET; i++) {
          rowMonth[i] = "";
          rowDay[i]   = "";
          rowDate[i]  = "";
        }

        // Fill date columns starting at OFFSET+1
        dateList.forEach((dt, idx) => {
          const d = new Date(dt);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const yyyy = d.getFullYear();
          const dayName = d.toLocaleString("en-US", { weekday: "short" });
          const dateNum = d.getDate();

          const col = OFFSET + 1 + idx;

          rowMonth[col] = { mm, yyyy };
          rowDay[col]   = dayName;
          rowDate[col]  = dateNum;
        });

        // Add 3 rows to sheet
        const r1 = worksheet.addRow(rowMonth);
        const r2 = worksheet.addRow(rowDay);
        const r3 = worksheet.addRow(rowDate);


        // === COLOR ONLY DATE HEADER CELLS (ASH COLOR) ===
        const ashColor = 'D9D9D9';
        const startCol = OFFSET + 1;               // first date column
        const endCol   = OFFSET + dateList.length; // last date column

        // Month row (r1)
        for (let c = startCol; c <= endCol; c++) {
          const cell = r1.getCell(c);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ashColor }
          };
          cell.font = { bold: true };
        }

        // Day row (r2)
        for (let c = startCol; c <= endCol; c++) {
          const cell = r2.getCell(c);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ashColor }
          };
          cell.font = { bold: true };
        }

        // Date row (r3)
        for (let c = startCol; c <= endCol; c++) {
          const cell = r3.getCell(c);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: ashColor }
          };
          cell.font = { bold: true };
        }

        // === MERGE MONTH CELLS BY GROUP ===
        let start = OFFSET + 1; // first date column index (12 offset + 1)
        let currentMM = rowMonth[start]?.mm;
        let currentYY = rowMonth[start]?.yyyy;

        for (let col = start + 1; col <= OFFSET + dateList.length; col++) {
          const thisCell = rowMonth[col];

          if (!thisCell || thisCell.mm !== currentMM || thisCell.yyyy !== currentYY) {
            // merge from start → col-1
            if (col - 1 >= start) {
              worksheet.mergeCells(r1.number, start, r1.number, col - 1);
              const cell = worksheet.getRow(r1.number).getCell(start);
              cell.value = `${monthName(currentMM)} - ${currentYY}`;
              cell.alignment = { horizontal: "center", vertical: "middle" };
              cell.font = { bold: true };
            }

            // reset group
            start = col;
            currentMM = thisCell?.mm;
            currentYY = thisCell?.yyyy;
          }
        }

        // merge last group
        // merge last group correctly
        worksheet.mergeCells(
          r1.number,
          start,
          r1.number,
          OFFSET + dateList.length  // <-- Correct!
        );
        const cellLast = worksheet.getRow(r1.number).getCell(start);
        cellLast.value = `${monthName(currentMM)} - ${currentYY}`;
        cellLast.alignment = { horizontal: "center", vertical: "middle" };
        cellLast.font = { bold: true };

        // Style Month-Year row
        r1.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        // Style Day row (VERTICAL)
        r2.height = 40; // Give space for vertical text
        r2.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            textRotation: 90,     // ← ROTATE 90°
            wrapText: true
          };
        });

        // Style Date row
        r3.eachCell((cell) => {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        });

        // Capture the 3rd row index (for later weekend shading)
        const DATE_HEADER_END_ROW = r3.number;

                // Property Header Row (ASH COLORED)
        const headerRow = worksheet.addRow(propertyHeaders);

        headerRow.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'D9D9D9' } // ASH color
          };
          cell.font = { bold: true };
        });

        // Property Benefits Section
        const propHeaderRow = worksheet.addRow([`Property Benefits`]);

        propHeaderRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FABF8F' }
        };


        const propRows = (flatPropertyPrograms || []).filter(r => toStr(r.Channel) === ch);

        if (propRows.length > 0) {
          propRows.forEach(r => {
            // Calculate basic values needed for both Value and Formula modes
            const rateCardCost = num(r.RateCardCost);
            const budget = num(r.Budget);
            const spots = num(r.Spots);
            const tvr = num(r.TVR);
            const ntvr = num(r.NTVR);

            // 1. Prepare the first 9 columns (Static Data)
            // Columns A to I
            const rowData = [
              toStr(r['Name of the program']), // A
              toStr(r['Com name']),            // B
              Number(num(r.Duration)),         // C
              toStr(r.Language ?? ""),         // D
              toStr(r.Day),                    // E
              toStr(r.Time),                   // F
              toStr(r.PTNPT ?? ""),            // G
              Number(rateCardCost),            // H (Rate Card Cost)
              0,                               // I (Negotiated Value)
            ];

            if (useFormulas) {
              // --- FORMULA MODE ---
              // Determine the Row Index this new row will occupy
              const idx = worksheet.rowCount + 1;

              rowData.push(
                // Col J: Rate Card Total = RateCardCost(H) * Spots(R)
                { formula: `H${idx}*R${idx}` },

                // Col K: Total Budget (Static Input for Property)
                Number(budget),

                // Col L: Total Saving = RateCardTotal(J) - TotalBudget(K)
                { formula: `J${idx}-K${idx}` },

                // Col M: TVR (Static Value)
                Number(tvr),

                // Col N: NTVR (Static Value)
                Number(ntvr),

                // Col O: GRP = TVR(M) * Spots(R)
                { formula: `M${idx}*R${idx}` },

                // Col P: NGRP = NTVR(N) * Spots(R)
                { formula: `N${idx}*R${idx}` },

                // Col Q: CPRP = TotalBudget(K) / NGRP(P)
                // Wrapped in IFERROR to handle division by zero
                { formula: `IFERROR(K${idx}/P${idx}, 0)` },

                // Col R: Spots (Static Value)
                Number(spots)
              );
            } else {
              // --- VALUE MODE (Existing Logic) ---
              const rateCardTotal = rateCardCost * spots;
              const totalSaving = rateCardTotal - budget;
              const grp = tvr * spots;
              const ngrp = num(r.NGRP); // or ntvr * spots
              const cprp = num(r.CPRP);

              rowData.push(
                Number(rateCardTotal), // J
                Number(budget),        // K
                Number(totalSaving),   // L
                Number(tvr),           // M
                Number(ntvr),          // N
                Number(grp),           // O
                Number(ngrp),          // P
                Number(cprp),          // Q
                Number(spots)          // R
              );
            }

            worksheet.addRow(rowData);
          });
        } else {
          worksheet.addRow(['(No property rows)']);
        }


        const commercialHeaderRows = [];
        // SECTION: Commercial Programs (Main + Benefit merged)
        let headerAdded = false;
        let hasCommercialData = false; // ADD THIS
        (allCommercialKeys || []).forEach((commercialKey, idx) => {
         const commDuration = num(commercialDurations[commercialKey] || 0);

          const mainPrograms = (mainCommercialData?.[commercialKey]?.programs || [])
            .filter(r => toStr(r.Channel) === ch);
          const benefitPrograms = (benefitCommercialData?.[commercialKey]?.programs || [])
            .filter(r => toStr(r.Channel) === ch);

          const mergedPrograms = mergeProgramsForExport(mainPrograms, benefitPrograms);

          if (mergedPrograms.length > 0) {
                hasCommercialData = true;

          worksheet.addRow([]);

          const customName = commercialNames[commercialKey] || `Commercial ${idx + 1}`;
            const commercialHeaderRow = worksheet.addRow([`${customName}`]);
            const commercialHeaderRowIndex = commercialHeaderRow.number;
            commercialHeaderRows.push(commercialHeaderRowIndex);


    // In the commercial section where you add program rows, replace this part:
    if (mergedPrograms.length > 0) {
      mergedPrograms.forEach(r => {
        // --- base values ---
        const program   = toStr(r.Program);
        const day       = toStr(r.Day ?? r.Date ?? '');
        const time      = toStr(r.Time ?? '');
        const slot      = toStr(r.Slot ?? 'A');

        const cost      = num(r.Cost ?? r.NCost ?? r.Total_Cost ?? 0);      // Cost (LKR)
        const ncost     = num(r.NCost ?? r.Cost ?? 0);                       // NCost (LKR)
        const tvr       = num(r.TVR ?? r.NTVR ?? 0);                         // TVR
        const ntvr      = num(r.NTVR ?? r.TVR ?? 0);                         // NTVR
        const spots     = num(r.Spots ?? 0);                                 // Spots

        const totalBudget   = num(r.Total_Cost ?? 0);                        // Total Budget (LKR)
        const ngrp          = num(r.Total_Rating ?? r.Total_NTVR ?? 0);      // NGRP
        const cprp          = ngrp > 0 ? totalBudget / ngrp : 0;             // CPRP

        // Duration: from optimization results (per-row) or 0 if missing
        const duration      = commDuration;            // seconds

        // Nrate = Cost (LKR) / 30 * Duration
        const nrate = (cost / 30) * commDuration;

        // Rate Card Total = Nrate * Spots
        const rateCardTotal = nrate * spots;

        // Total Saving = Rate Card Total - Total Budget
        const totalSaving   = rateCardTotal - totalBudget;

        // Commercial name + language from dialog
        const comName       = commercialNames[commercialKey] || `Commercial ${idx + 1}`;
        const lang          = commercialLanguages[commercialKey] || "";

        const rowData = [
          // Program
          program,
          // Com name
          comName,
          // Duration
          Number(duration),
          // Language
          lang,
          // Day
          day,
          // Time
          time,
          // PT / NPT
          slot,
          // Nrate
          Number(nrate),
          // NCost (LKR)
          Number(ncost),
        ];

        if (useFormulas) {
          // For formulas export, add formulas instead of calculated values
          rowData.push(
            { formula: `H${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // Rate Card Total (LKR) - Column J
            { formula: `I${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // Total Budget (LKR) - This is the correction!
            { formula: `J${worksheet.rowCount + 1}-K${worksheet.rowCount + 1}` }, // Total Saving (LKR)
            Number(tvr), // TVR - Keep as value
            Number(ntvr), // NTVR - Keep as value
            { formula: `M${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // GRP
            { formula: `N${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // NGRP
            { formula: `K${worksheet.rowCount + 1}/P${worksheet.rowCount + 1}` }, // CPRP
            Number(spots) // Spots - Keep as value
          );
        } else {
          // For normal export, use calculated values
          rowData.push(
            Number(rateCardTotal), // Rate Card Total (LKR)
            Number(totalBudget),   // Total Budget (LKR)
            Number(totalSaving),   // Total Saving (LKR)
            Number(tvr),           // TVR
            Number(ntvr),          // NTVR
            Number(tvr * spots),   // GRP
            Number(ngrp),          // NGRP
            Number(cprp),          // CPRP
            Number(spots)          // Spots
          );
        }

        worksheet.addRow(rowData);
      });
    }}
    });

    // === ADD THIS AFTER THE COMMERCIAL LOOP ===
    if (!hasCommercialData) {
      worksheet.addRow([]);
      const noCommHeader = worksheet.addRow([`Commercial Programs`]);
      noCommHeader.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FABF8F' }
      };
      worksheet.addRow(['No commercial programs for this channel']);
    }

        // FINAL SECTION: Bonus Programs
        const bonusRows = (bonusByProgram || []).filter(r => toStr(r.Channel) === ch);
        worksheet.addRow([]);

        const bonusHeaderRow = worksheet.addRow([`Bonus Programs`]);

        bonusHeaderRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FABF8F' }  //
        };

        // In the bonus section, replace the row creation with:
        if (bonusRows.length > 0) {
          bonusRows.forEach(r => {
            // --- Identify commercial key from the row ---
            const bonusCommercialKey = normalizeCommercial(
              r.Commercial ?? r.comName ?? r['Com name'] ?? r['Com Name'] ?? r.ComName ?? 'COM_1',
              { zeroBasedNumeric: false }
            );

            // --- Commercial details from dialog ---
            const comName = commercialNames[bonusCommercialKey] || bonusCommercialKey;
            const lang    = commercialLanguages[bonusCommercialKey] || "";

            // --- base values ---
            const program   = toStr(r.Program);
            const day       = toStr(r.Day ?? r.Date ?? '');
            const time      = toStr(r.Time ?? '');
            const slot      = 'B';

            const cost      = num(r.Cost ?? r.NCost ?? r.Total_Cost ?? 0);
            const ncost       = 0;
            const tvr       = num(r.TVR ?? r.NTVR ?? 0);
            const ntvr      = num(r.NTVR ?? r.TVR ?? 0);
            const spots     = num(r.Spots ?? 0);

            const totalBudget = 0;
            const ngrp          = num(r.Total_Rating ?? r.Total_NTVR ?? 0);
            const cprp          = ngrp > 0 ? totalBudget / ngrp : 0;

            const duration      = num(r.Duration ?? r.duration ?? 0);

            // New fields
            const nrate         = (cost / 30) * duration;
            const rateCardTotal = nrate * spots;
            const totalSaving   = rateCardTotal - totalBudget;

            const rowData = [
              program,
              comName,
              Number(duration),
              lang,
              day,
              time,
              slot,
              Number(nrate),
              Number(ncost),
            ];

            // Add the formula columns based on exportWithFormulas flag
            if (useFormulas) {
              rowData.push(
                { formula: `H${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // Rate Card Total (LKR)
                Number(totalBudget), // Total Budget (LKR)
                { formula: `J${worksheet.rowCount + 1}-K${worksheet.rowCount + 1}` }, // Total Saving (LKR)
                Number(tvr), // TVR
                Number(ntvr), // NTVR
                { formula: `M${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // GRP
                { formula: `N${worksheet.rowCount + 1}*R${worksheet.rowCount + 1}` }, // NGRP
                { formula: `K${worksheet.rowCount + 1}/P${worksheet.rowCount + 1}` }, // CPRP
                Number(spots) // Spots
              );
            } else {
              rowData.push(
                Number(rateCardTotal), // Rate Card Total (LKR)
                Number(totalBudget),   // Total Budget (LKR)
                Number(totalSaving),   // Total Saving (LKR)
                Number(tvr),           // TVR
                Number(ntvr),          // NTVR
                Number(tvr * spots),   // GRP
                Number(ngrp),          // NGRP
                Number(cprp),          // CPRP
                Number(spots)          // Spots
              );
            }
            worksheet.addRow(rowData);
          });
        } else {
          worksheet.addRow(['No bonus programs for this channel']);
        }

        // ---------- CALCULATE TOTALS FOR TOTAL ROW ----------
        const hasAnyData = propRows.length > 0 || hasCommercialData || bonusRows.length > 0;
        const totalRowData = {
          rateCardValue: 0,
          rateCardTotal: 0,
          totalBudget: 0,
          totalSaving: 0,
          grp: 0,
          ngrp: 0,
          spots: 0
        };

        // ... (Keep your existing loop logic to calculate totalRowData values for fallback) ...
        // Property section
        propRows.forEach(r => {
          const rateCardValue = num(r.RateCardCost);
          const spots = num(r.Spots);
          const rateCardTotal = rateCardValue * spots;
          const totalBudget = num(r.Budget);

          totalRowData.rateCardValue += rateCardValue;
          totalRowData.rateCardTotal += rateCardTotal;
          totalRowData.totalBudget += totalBudget;
          totalRowData.totalSaving += (rateCardTotal - totalBudget);
          totalRowData.grp += num(r.TVR) * spots;
          totalRowData.ngrp += num(r.NGRP);
          totalRowData.spots += spots;
        });

        // Commercial sections (Main + Benefit)
        allCommercialKeys.forEach((commercialKey) => {
          const mainPrograms = (mainCommercialData?.[commercialKey]?.programs || []).filter(r => toStr(r.Channel) === ch);
          const benefitPrograms = (benefitCommercialData?.[commercialKey]?.programs || []).filter(r => toStr(r.Channel) === ch);
          const mergedPrograms = mergeProgramsForExport(mainPrograms, benefitPrograms);

          mergedPrograms.forEach(r => {
             const cost = num(r.Cost ?? r.NCost ?? r.Total_Cost ?? 0);
             const duration = commercialDurations[commercialKey] || 0;
             const spots = num(r.Spots ?? 0);
             const nrate = (cost / 30) * duration;
             const rateCardTotal = nrate * spots;
             const totalBudget = num(r.Total_Cost ?? 0);
             const ngrp = num(r.Total_Rating ?? r.Total_NTVR ?? 0);
             const tvr = num(r.TVR ?? r.NTVR ?? 0);

             totalRowData.rateCardValue += nrate;
             totalRowData.rateCardTotal += rateCardTotal;
             totalRowData.totalBudget += totalBudget;
             totalRowData.totalSaving += (rateCardTotal - totalBudget);
             totalRowData.grp += tvr * spots;
             totalRowData.ngrp += ngrp;
             totalRowData.spots += spots;
          });
        });

        // Bonus section
        bonusRows.forEach(r => {
          const cost = num(r.Cost ?? r.NCost ?? r.Total_Cost ?? 0);
          const duration = num(r.Duration ?? r.duration ?? 0);
          const spots = num(r.Spots ?? 0);
          const nrate = (cost / 30) * duration;
          const rateCardTotal = nrate * spots;
          const totalBudget = 0;
          const ngrp = num(r.Total_Rating ?? r.Total_NTVR ?? 0);
          const tvr = num(r.TVR ?? r.NTVR ?? 0);

          totalRowData.rateCardValue += nrate;
          totalRowData.rateCardTotal += rateCardTotal;
          totalRowData.totalBudget += totalBudget;
          totalRowData.totalSaving += (rateCardTotal - totalBudget);
          totalRowData.grp += tvr * spots;
          totalRowData.ngrp += ngrp;
          totalRowData.spots += spots;
        });

        // Calculate CPRP (JS Calculation Fallback)
        const cprp = totalRowData.ngrp > 0 ? totalRowData.totalBudget / totalRowData.ngrp : 0;


        // --- NEW FORMULA LOGIC STARTS HERE ---

        // 1. Determine the data range
        // The header is at `propHeaderRow.number`. Data starts immediately after.
        const startRow = propHeaderRow.number + 1;

        // The current last row in the sheet is the end of the data
        const endRow = worksheet.rowCount;

        // The Total row will be the NEXT row
        const totalRowIndex = endRow + 1;

        let totalRowValues = [];

        if (useFormulas){
          totalRowValues = [
            "Total", // Col 1
            "",      // Col 2
            "",      // Col 3
            "",      // Col 4
            "",      // Col 5
            "",      // Col 6
            "",      // Col 7
            "",      // Col 8 (Rate Card Value - usually empty in total)
            "",      // Col 9 (Negotiated Value)

            // Col 10 (J): Rate Card Total -> SUM(Jstart:Jend)
            { formula: `SUM(J${startRow}:J${endRow})` },

            // Col 11 (K): Total Budget -> SUM(Kstart:Kend)
            { formula: `SUM(K${startRow}:K${endRow})` },

            // Col 12 (L): Total Saving -> SUM(Lstart:Lend)
            { formula: `SUM(L${startRow}:L${endRow})` },

            "",      // Col 13 (TVR)
            "",      // Col 14 (NTVR)

            // Col 15 (O): GRP -> SUM(Ostart:Oend)
            { formula: `SUM(O${startRow}:O${endRow})` },

            // Col 16 (P): NGRP -> SUM(Pstart:Pend)
            { formula: `SUM(P${startRow}:P${endRow})` },

            // Col 17 (Q): CPRP -> Total Budget / Total NGRP -> K_total / P_total
            { formula: `IFERROR(K${totalRowIndex}/P${totalRowIndex}, 0)` },

            // Col 18 (R): Spots -> SUM(Rstart:Rend)
            { formula: `SUM(R${startRow}:R${endRow})` }
          ];
        } else {
          // Normal Export (Values)
          totalRowValues = [
            "Total",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            Number(totalRowData.rateCardTotal),        // Col 10
            Number(totalRowData.totalBudget),          // Col 11
            Number(totalRowData.totalSaving),          // Col 12
            "",
            "",
            Number(totalRowData.grp),                  // Col 15
            Number(totalRowData.ngrp),                 // Col 16
            Number(cprp),                              // Col 17
            Number(totalRowData.spots)                 // Col 18
          ];
        }

        // Add Total Row
        const totalRow = worksheet.addRow(totalRowValues);

        // ... (Keep the rest of the styling logic below unchanged) ...
        // Color the total row with the same orange color as commercial headers (first 18 columns only)
        for (let c = 1; c <= 18; c++) {
          const cell = totalRow.getCell(c);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FABF8F' } // Same orange color as commercial headers
          };
          cell.font = { bold: true };
        }
        // ============ END OF ADDED CODE ============

            // === APPLY BONUS ROW STYLING ===
            let bonusStartRow = -1;
            let totalRowNumber = -1;
            worksheet.eachRow((row, rowNumber) => {
              if (row.getCell(1).value === 'Bonus Programs') {
                bonusStartRow = rowNumber + 1; // data starts 2 rows below
              }
              if (row.getCell(1).value === 'Total') {
                totalRowNumber = rowNumber;
              }
            });

            if (bonusStartRow > 0 && bonusRows.length > 0) {
              const bonusEndRow = bonusStartRow + bonusRows.length - 1;
              for (let r = bonusStartRow; r <= bonusEndRow; r++) {
                const row = worksheet.getRow(r);
                row.eachCell((cell) => {
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFDEEFFA' } // Light blue
                  };
                });
              }

              // Apply orange color to the total row (override the light blue)
              if (totalRowNumber > 0) {
                for (let c = 1; c <= 18; c++) {
                  const cell = worksheet.getRow(totalRowNumber).getCell(c);
                  cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FABF8F' } // Orange color
                  };
                  cell.font = { bold: true };
                }
              }
            }

            // find area where actual program rows begin
            const firstProgramRow = worksheet._rows.find(r => {
              if (!r) return false;
              const v = r.getCell(1).value;
              return typeof v === 'string' && !v.includes("Property") && !v.includes("Bonus") && v.trim() !== "" && !isNaN(v.match(/\d/));
            })?.number || 10;

        // === APPLY WEEKEND COLUMN SHADING ===
        dateList.forEach((dt, idx) => {
          const col = 19 + idx; // ExcelJS columns are 1-based, starting after 12 offset columns + 1
          const day = new Date(dt).getDay();
          if (day !== 0 && day !== 6) return; // not weekend

          // Stop at the row before the total row (bonus section ends before total row)
          const lastRowForDates = totalRow.number - 1;

          for (let r = firstProgramRow; r <= lastRowForDates; r++) {
            const row = worksheet.getRow(r);

            // === SKIP HEADER ROWS (Property, Commercial, Bonus) ===
            // FINAL FIX: skip commercial header rows
            if (commercialHeaderRows.includes(r)) {
              continue;
            }

            // Apply weekend shading
            const cell = row.getCell(col);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'D8E4BC' } // Light green
            };
          }
        });

        if (bonusStartRow > 0 && bonusRows.length > 0) {
          const bonusEndRow = bonusStartRow + bonusRows.length - 1;
          for (let r = bonusStartRow; r <= bonusEndRow; r++) {
            const row = worksheet.getRow(r);
            row.eachCell((cell) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFDEEFFA' } // Light blue
              };
            });
          }
        }


        // --- CUSTOM COLUMN WIDTHS ---
        worksheet.getColumn(1).width = 25;
        worksheet.getColumn(2).width = 15;
        worksheet.getColumn(3).width = 10;

        worksheet.getColumn(5).width = 10;
        worksheet.getColumn(6).width = 10;

        // Date columns (start at column M = 13)
        const firstDateCol = 19;
        dateList.forEach((_, idx) => {
          worksheet.getColumn(firstDateCol + idx).width = 3;
        });

        // === APPLY BORDER STYLING ===

        // Identify where borders should start
        const propertyHeaderRowIndex = headerRow.number;     // first header after Property Benefits
        const firstBorderRow = headerRow.number;    // start horizontal/vertical borders from here
        const firstBorderCol = startCol;                     // first date column (OFFSET + 1)
        const lastRow = worksheet.rowCount;
        const lastCol = worksheet.actualColumnCount;

        // Starting row for date section (first row with dates)
        const firstDateRow = r3.number + 1;   // date header rows end at r3


        // === VERTICAL BORDER at START (first date column) ===
        for (let r = firstDateRow; r <= worksheet.rowCount; r++) {
          const cell = worksheet.getRow(r).getCell(startCol);
          cell.border = {
            ...cell.border,
            left: { style: 'thin' }
          };
        }

        // === VERTICAL BORDER at END (last date column) ===
    //    for (let r = firstDateRow; r <= worksheet.rowCount; r++) {
      //    const cell = worksheet.getRow(r).getCell(lastCol);
     //     cell.border = {
       //     ...cell.border,
     //       right: { style: 'thin' }
      //    };
      //  }

        // ⭐ Vertical borders for first 20 columns (header → end of bonus section, excluding total row)
        const bonusEndRow = bonusStartRow + bonusRows.length -1 ;

        for (let r = firstBorderRow; r <= bonusEndRow; r++) {
          const row = worksheet.getRow(r);
          for (let c = 1; c <= 18; c++) {
            const cell = row.getCell(c);
            cell.border = {
              ...cell.border,
              left:  { style: 'thin' },
              right: { style: 'thin' }
            };
          }
        }

        // Apply borders to total row separately (only first 18 columns)
        if (totalRowNumber > 0) {
          const totalRowObj = worksheet.getRow(totalRowNumber);
          for (let c = 1; c <= 18; c++) {
            const cell = totalRowObj.getCell(c);
            cell.border = {
              ...cell.border,
              left:  { style: 'thin' },
              right: { style: 'thin' },
              top: { style: 'thin' },
              bottom: { style: 'thin' }
            };
          }
        }

        // === COLOR FULL PROPERTY BENEFITS TOPIC ROW ===
        for (let c = 1; c <= lastCol; c++) {
          const cell = propHeaderRow.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FABF8F' }};
          cell.font = { bold: true };
        }

        // === COLOR FULL COMMERCIAL HEADER ROWS (whether default name or custom name) ===
        commercialHeaderRows.forEach((rowIndex) => {
          const row = worksheet.getRow(rowIndex);
          for (let c = 1; c <= lastCol; c++) {
            const cell = row.getCell(c);
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FABF8F' } // your brownish highlight
            };
            cell.font = { bold: true };
          }
        });

        // === COLOR FULL BONUS HEADER ROW ===
        for (let c = 1; c <= lastCol; c++) {
          const cell = bonusHeaderRow.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FABF8F' }};
          cell.font = { bold: true };
        }

    // --- 1) HORIZONTAL THIN BORDERS ---
    for (let r = firstBorderRow; r <= lastRow; r++) {
      const row = worksheet.getRow(r);

      // For total row, only apply borders to first 18 columns
      if (r === totalRowNumber) {
        for (let c = 1; c <= 18; c++) {
          const cell = row.getCell(c);
          cell.border = {
            ...cell.border,
            top: { style: 'thin' },
            bottom: { style: 'thin' }
          };
        }
      } else {
        // For all other rows, apply borders to all columns
        for (let c = 1; c <= lastCol; c++) {
          const cell = row.getCell(c);
          cell.border = {
            ...cell.border,
            top: { style: 'thin' },
            bottom: { style: 'thin' }
          };
        }
      }
    }

    // --- 2) VERTICAL DOTTED BORDERS (INSIDE DATE AREA ONLY) ---
    // Stop at the row before the total row (bonus section ends before total row)
    const lastRowForDateBorders = totalRow.number - 1;

    for (let r = firstBorderRow; r <= lastRowForDateBorders; r++) {
      const row = worksheet.getRow(r);

      for (let c = firstBorderCol + 1; c <= lastCol - 1; c++) {
        const cell = row.getCell(c);
        cell.border = {
          ...cell.border,
          left: { style: 'dotted' },
          right: { style: 'dotted' }
        };
      }
    }

    // --- 3) SOLID LEFT BORDER (OVERRIDE dotted) ---
    for (let r = firstDateRow; r <= lastRowForDateBorders; r++) {
      const cell = worksheet.getRow(r).getCell(firstBorderCol);
      cell.border = {
        ...cell.border,
        left: { style: 'thin' }  // override dotted
      };
    }

    // --- 4) SOLID RIGHT BORDER (OVERRIDE dotted) ---
    for (let r = firstDateRow; r <= lastRowForDateBorders; r++) {
      const cell = worksheet.getRow(r).getCell(lastCol);
      cell.border = {
        ...cell.border,
        right: { style: 'thin' } // override dotted
      };
    }

    // === APPLY SOLID BORDER TO DATE HEADER ROWS (r1, r2, r3) ===
        [r1, r2, r3].forEach((row) => {
          // Solid LEFT BORDER
          const leftCell = row.getCell(firstBorderCol);
          leftCell.border = {
            ...leftCell.border,
            left: { style: 'thin' },
          };

          // Solid RIGHT BORDER
          const rightCell = row.getCell(lastCol);
          rightCell.border = {
            ...rightCell.border,
            right: { style: 'thin' },
          };
        });

        [r1, r2, r3].forEach((row) => {
          for (let c = firstBorderCol; c <= lastCol; c++) {
            const cell = row.getCell(c);
            cell.border = {
              ...cell.border,    // <<<<<< preserve previous left/right
              top: { style: 'thin' },
              bottom: { style: 'thin' },
            };
          }

                // === ADD VERTICAL THIN BORDERS FOR ROW 6 & 7 (DATE COLUMNS ONLY) ===
        const row6 = worksheet.getRow(r3.number -1);  // Row after date headers (PT/NPT header)
        const row7 = worksheet.getRow(r3.number );  // Next row (Cost/TVR header)

        for (let c = firstBorderCol + 1; c <= lastCol - 1; c++) {
          const cell6 = row6.getCell(c);
          const cell7 = row7.getCell(c);

          cell6.border = {
            ...cell6.border,
            left: { style: 'thin' },
            right: { style: 'thin' },
          };

          cell7.border = {
            ...cell7.border,
            left: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
        });
    removeGridlines(worksheet);
      });

    if (combinedChannelRows?.length) {
      const summarySheet = workbook.addWorksheet('Channel Summary (All-In)');
      summarySheet.properties.showGridLines = false;

      const summaryHeaders = [
        'Channel', 'Cost', 'Property value', 'Total Cost',
        'Spot Buying GRP', 'Property GRP', 'Bonus GRP', 'Total GRP',
        'Spot Buying NGRP', 'Property NGRP', 'Bonus NGRP', 'Total NGRP', 'CPRP'
      ];

      // --- Header Row ---
      const headerRow = summarySheet.addRow(summaryHeaders);

      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'C6EFCE' }  // same Excel light green as KPI sheet
        };
        cell.font = { bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle',wrapText: true  };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      // --- Add Data Rows ---
      combinedChannelRows.forEach((r) => {
        const row = summarySheet.addRow([
          r.Channel,
          Number(r.Cost_LKR),
          Number(r.Property_LKR),
          Number(r.TotalCost_LKR),
            // ✔ Correct Spot GRP (already in r)
            Number(r.GRP_Spot),

            // ✔ Correct Property GRP (manual + benefit)
            Number(r.GRP_Property),

            // ✔ Correct Bonus GRP
            Number(r.GRP_Bonus),
          Number(r.GRP_Total),
          Number(r.NGRP_Spot),
          Number(r.NGRP_Property),
          Number(r.NGRP_Bonus),
          Number(r.NGRP_Total),
          Number(r.CPRP_LKR),
        ]);

        row.eachCell((cell) => {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });

        // make first column (Channel) left-aligned
        row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // --- FIXED COLUMN WIDTHS (all = 10) ---
      summarySheet.columns.forEach((col) => {
        col.width = 13;
      });
      removeGridlines(summarySheet);
    }


      // ---------- Save ----------
    // In the save section, modify the filename:
// ---------- Save (Updated Filename Logic) ----------

    // 1. Prepare file parts
    const clientPart = clientName ? `_${clientName}` : "";
    // Create a period string like "_2023-10-01_to_2023-10-07"
    const periodPart = `_${fromDate}_to_${toDate}`;

    // 2. Determine base name based on the formula flag
    const baseName = useFormulas
      ? 'Final_Plan_By_Channel_With_Formulas'
      : 'Final_Plan_By_Channel';

    // 3. Combine them: Name + Client + Period + Extension
    const filename = `${baseName}${clientPart}${periodPart}.xlsx`;

    try {
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), filename);
    } catch (error) {
      console.error('Error exporting Excel file:', error);
      alert('Error exporting Excel file. Please try again.');
    }
    };



  // ---------- Styles (same as OptimizationResults.jsx) ----------
  const s = {
    container: {marginTop: '24px', padding: '60px', maxWidth: '1200px', margin: '0 auto', backgroundColor: '#d5e9f7', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)' },
    title: { color: '#2d3748', fontSize: '24px', fontWeight: '600', marginBottom: '16px' },
    sectionTitle: { color: '#2d3748', fontSize: '20px', fontWeight: '600', marginBottom: '20px' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
    summaryCard: { backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryCard_1: { marginBottom: '20px' , backgroundColor: 'white', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)' },
    summaryTitle: { color: '#4a5568', fontSize: '14px', fontWeight: '600', marginBottom: '8px' },
    summaryValue: { color: '#2d3748', fontSize: '18px', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '16px' },
    th: { border: '1px solid #ccc', padding: '8px', background: '#f7fafc', fontWeight: '600' },
    td: { border: '1px solid #eee', padding: '8px', textAlign: 'center' },
    exportButton: { padding: '12px 24px', backgroundColor: '#38a169', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease', marginTop: '24px', marginRight: '20px' },
    backHomeButton: { padding: '12px 24px', backgroundColor: '#edf2f7', color: '#2d3748', border: '1px solid #cbd5e0', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', marginTop: '16px', marginRight: '20px' },
    primaryButton: { padding: '12px 24px', backgroundColor: '#4299e1', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '500', cursor: 'pointer' },
    label: { color: '#4a5568', fontWeight: '500', fontSize: '14px' },
    benefitRow: { background: '#ECEDE6' },

    // Commercial header
    commercialHeader: { fontWeight: '800', marginTop: '20px', marginBottom: '16px', color: '#2d3748', fontSize: '18px' },
    commercialSub: { fontSize: '13px', color: '#4a5568', marginBottom: '12px' },

    // Bonus row background
    bonusRow: { background: '#deeffa' }, // light ash
  };
      s.tdNowrap = { ...s.td, whiteSpace: 'nowrap' };

      s.inputBox = {
          width: "100%",
          padding: "8px",
          marginBottom: "12px",
          border: "1px solid #ccc",
          borderRadius: "6px"
        };

    const highlightCard = {
      backgroundColor: '#38a169',   // deep green
      //border: '2px solid #1b5e20',  // darker green border
      color: 'white',               // white text
    };

    const normalizeRow = (r) => ({
      Channel: toStr(r.Channel),
      Program: toStr(r.Program),
      Day: toStr(r.Day ?? r.Date ?? ''),
      Time: toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
      Slot: toStr(r.Slot ?? 'A'),
      Cost: num(r.Cost ?? r.NCost ?? r.Total_Cost ?? 0),
      TVR: num(r.TVR ?? r.NTVR ?? 0),
      NCost: num(r.NCost ?? r.Cost ?? 0),
      NTVR: num(r.NTVR ?? r.TVR ?? 0),
      Total_Cost: num(r.Total_Cost ?? r.Cost ?? 0),
      Total_Rating: num(r.Total_Rating ?? r.Total_NTVR ?? 0),
      Spots: num(r.Spots ?? 0),
    });

  // Helper for formatting numbers in table
  const toFixedOrInt = (key, val) => {
    const numericCols = ['Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating'];
    const isNumeric = numericCols.includes(key);
    const isCount = key === 'Spots';
    if (isCount) return parseInt(val);
    if (isNumeric) return Number(val).toFixed(2);
    return val;
  };

  // NEW: State for merging benefit into main
  const [mergeBenefit, setMergeBenefit] = useState(false);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [clientName, setClientName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [refNo, setRefNo] = useState("");
  const [commercialNames, setCommercialNames] = useState({});
  const [activity] = useState("TV Schedule");  // fixed
  const [campaign, setCampaign] = useState("");
  const [tvBudget, setTvBudget] = useState("");
  const [durationName, setDurationName] = useState("");
  const [commercialLanguages, setCommercialLanguages] = useState({});

  const savePlan = async () => {
    try {
      const auth = (typeof window !== 'undefined' && window.__AUTH__) || {};
      console.log("SAVE PLAN AUTH SNAPSHOT", {
      rawAuth: window.__AUTH__,
      resolvedUserId: auth.userId || auth.user_id,
      directId: auth.id
    });
      const payload = {
        //user_id: auth.userId || auth.user_id || "",
        user_id: auth.id,
        user_first_name: auth.firstName || "",
        user_last_name: auth.lastName || "",
        metadata: {
          client_name: clientName || "",
          brand_name: brandName || "",
          campaign: campaign || "",
          activity,
          tv_budget: tvBudget || "",
          duration_label: durationName || "",
          activation_from: fromDate,
          activation_to: toDate,
          commercial_names: commercialNames,
          commercial_languages: commercialLanguages,
          selected_tg: selectedTG,
          total_budget: totalBudgetInclProperty,
        },
        session_data: sessionSnapshot || {},
      };

      const res = await fetch(`${API_BASE}/save-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        console.error("Save plan failed", json);
        alert(json.error || "Failed to save plan. Plan was not saved.");
        return false;
      }
      return true;
    } catch (err) {
      console.error("Error saving plan:", err);
      alert("Error saving plan. Please try again.");
      return false;
    }
  };


    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 6);

    const fmtDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Default: Today → 7 days ahead
    const [fromDate, setFromDate] = useState(fmtDate(today));
    const [toDate, setToDate] = useState(fmtDate(nextWeek));


  // ---------- Render ---<button type="button" onClick={handleExport} style={s.exportButton}>-------
  return (
    <div style={s.container}>
       <h2 style={s.pageTitle || {fontSize: 22,fontWeight: 700, margin: '8px 0 16px', letterSpacing: 0.3,}}>Final Optimized Plan (Property + Spot Buying + Bonus)</h2>
    {/* KPI Cards */}
    <div style={s.summaryGrid}>
      <div style={{ ...s.summaryCard, ...highlightCard }}>
         <div style={{ ...s.summaryTitle, color: 'white',fontWeight: '750' }}>Total Optimized Budget</div>
        <div style={{ ...s.summaryValue, color: 'white',fontWeight: '750' }}>{formatLKR(budgetInclProperty)}</div>
      </div>
    <div style={s.summaryCard}>
      <div style={s.summaryTitle}>Total GRP</div>
      <div style={s.summaryValue}>{safeFx(totalGRP_InclPropertyBonus)}</div>
    </div>
      <div style={s.summaryCard}>
      <div style={s.summaryTitle}>Spot Buying GRP</div>
      <div style={s.summaryValue}>{safeFx(mainSpotGRP)}</div>
    </div>
    <div style={s.summaryCard}>
      <div style={s.summaryTitle}>Property GRP</div>
      <div style={s.summaryValue}>{safeFx(propertyGRPTotal)}</div>
    </div>
    <div style={s.summaryCard}>
      <div style={s.summaryTitle}>Bonus GRP</div>
      <div style={s.summaryValue}>{safeFx(bonusGRP)}</div>
    </div>
    </div>

    <div style={s.summaryGrid}>
      <div style={{ ...s.summaryCard, ...highlightCard }}>
        <div style={{ ...s.summaryTitle, color: 'white' ,fontWeight: '750'}}>CPRP</div>
        <div style={{ ...s.summaryValue, color: 'white',fontWeight: '750' }}>{formatLKR(cprp_InclPropertyBonus)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Total NGRP</div>
        <div style={s.summaryValue}>{safeFx(totalNGRP_InclPropertyBonus)}</div>
      </div>
        <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Spot Buying NGRP</div>
        <div style={s.summaryValue}>{safeFx(mainSpotNGRP)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Property NGRP</div>
        <div style={s.summaryValue}>{safeFx(propertyNGRP_InclBenefit)}</div>
      </div>
      <div style={s.summaryCard}>
        <div style={s.summaryTitle}>Bonus NGRP</div>
        <div style={s.summaryValue}>{safeFx(bonusNGRP)}</div>
      </div>
    </div>

    {/* Property Program Details */}
    {flatPropertyPrograms.length > 0 && (
      <>
        <h3 style={s.sectionTitle}>Property Program Details</h3>
        <div style={s.summaryCard}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ ...s.table, minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={s.th}>Channel</th>
                    <th style={s.th}>Program</th>
                    <th style={s.th}>Commercial name</th>
                    <th style={s.th}>Duration</th>
                    <th style={s.th}>Language</th>
                    <th style={s.th}>Day</th>
                    <th style={s.th}>Time</th>
                    <th style={s.th}>PT / NPT</th>
                    <th style={s.th}>Rate Card Cost</th>
                    <th style={s.th}>On Cost</th>
                    <th style={s.th}>Rate Card Total</th>
                    <th style={s.th}>Total Budget</th>
                    <th style={s.th}>Total Saving</th>
                    <th style={s.th}>NCost</th>
                    <th style={s.th}>TVR</th>
                    <th style={s.th}>NTVR</th>
                    <th style={s.th}>GRP</th>
                    <th style={s.th}>NGRP</th>
                    <th style={s.th}>CPRP</th>
                    <th style={s.th}>Spots</th>
                  </tr>
                </thead>
                <tbody>
                    {flatPropertyPrograms.map((r, i) => {

                      // FIX ONLY THESE TWO (missing from editor)
                      const rateCardTotal = num(r.RateCardCost) * num(r.Spots);
                      const totalSaving = rateCardTotal - num(r.Budget);

                      return (
                        <tr key={`pp-${i}`}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{r.Channel}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{r['Name of the program']}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{r['Com name']}</td>

                          <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.Duration).toFixed(2)}</td>
                          <td style={s.td}>{r.Language ?? ""}</td>
                          <td style={s.td}>{r.Day}</td>
                          <td style={s.td}>{r.Time}</td>
                          <td style={s.td}>{r.PTNPT ?? ""}</td>

                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.RateCardCost)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Budget)}</td>

                          {/* ✔ FIXED: Rate Card Total */}
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(rateCardTotal)}</td>

                          {/* ✔ FIXED: Total Budget (same as On Cost) */}
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Budget)}</td>

                          {/* ✔ FIXED: Total Saving */}
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(totalSaving)}</td>

                          {/* Existing correct fields */}
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.NCost)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.TVR).toFixed(2)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.NTVR).toFixed(2)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR) * num(r.Spots))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{Number(r.NGRP).toFixed(2)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.CPRP)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{parseInt(r.Spots, 10)}</td>
                        </tr>
                      );
                    })}
                </tbody>
            </table>
          </div>
        </div>
      </>
    )}


      {/* Commercial-wise Allocation (Combined Main + Bonus) */}
      <h3 style={s.sectionTitle}>Commercial-wise Allocation (Paid + Bonus)</h3>
      <div style={{...s.commercialSub, marginBottom: '20px'}}>
        Shows spot buying results (in white) and commercial benefit results (in light brown), followed by bonus program results (shaded in light blue) for each commercial.
      </div>
      <div style={{marginBottom: '16px'}}>
        <label>
          <input type="checkbox" checked={mergeBenefit} onChange={e => setMergeBenefit(e.target.checked)} />
          Merge matching benefit programs into main (sum spots)
        </label>
      </div>

      {allCommercialKeys.map((commercialKey) => {
        const mainData = mainCommercialData[commercialKey] || {};
        const bonusData = bonusCommercialData[commercialKey] || {};

        const mainPrograms = mainData.programs || [];
        const benefitPrograms = (benefitCommercialData[commercialKey]?.programs) || [];
        const bonusPrograms = bonusData.programs || [];

        const mainBudget = num(mainData.total_cost);
        const mainNgrp = num(mainData.total_rating);
        const bonusNgrp = num(bonusData.total_rating);
        const totalNgrp = mainNgrp + bonusNgrp;

        const mainCprp = mainNgrp > 0 ? mainBudget / mainNgrp : 0;
        const combinedCprp = totalNgrp > 0 ? mainBudget / totalNgrp : 0;

        // Skip if no programs in either main or bonus
        // Skip only if no programs at all (main, benefit, bonus)
        if (mainPrograms.length === 0 && benefitPrograms.length === 0 && bonusPrograms.length === 0) {
          return null;
        }

        return (
          <div key={commercialKey} style={s.summaryCard_1}>
            <div style={s.commercialHeader}>{commercialKey.toUpperCase()}</div>
            <div style={s.commercialSub}>
              <strong>Total Budget:</strong> {formatLKR(mainBudget)} &nbsp; | &nbsp;
              <strong>Main NGRP:</strong> {safeFx(mainNgrp)} &nbsp; | &nbsp;
              <strong>Bonus NGRP:</strong> {safeFx(bonusNgrp)} &nbsp; | &nbsp;
              <strong>Combined NGRP:</strong> {safeFx(totalNgrp)} &nbsp; | &nbsp;
              <strong>Main CPRP:</strong> {formatLKR(mainCprp)} &nbsp; | &nbsp;
              <strong>Combined CPRP:</strong> {formatLKR(combinedCprp)}
            </div>

            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Channel</th>
                  <th style={s.th}>Program</th>
                  <th style={s.th}>Day</th>
                  <th style={{ ...s.th, whiteSpace: 'nowrap' }}>Time</th>
                  <th style={s.th}>PT [A] / NPT [B]</th>
                  <th style={s.th}>Cost</th>
                  <th style={s.th}>TVR</th>
                  <th style={s.th}>NCost</th>
                  <th style={s.th}>NTVR</th>
                  <th style={s.th}>Total Budget</th>
                  <th style={s.th}>GRP</th>
                  <th style={s.th}>NGRP</th>
                  <th style={s.th}>Spots</th>
                </tr>
              </thead>

                <tbody>
                  {(() => {
                    // group helpers
                    const groupByChannel = (rows) => {
                      const m = {};
                      rows.forEach((r) => {
                        const ch = toStr(r.Channel);
                        if (!m[ch]) m[ch] = [];
                        m[ch].push(r);
                      });
                      return m;
                    };

                    const mainByCh    = groupByChannel(mainPrograms);
                    const benefitByCh = groupByChannel(benefitPrograms); // ✅ added
                    const bonusByCh   = groupByChannel(bonusPrograms);

                    // union of channels (sorted)
                    const allChannels = Array.from(
                      new Set([
                        ...Object.keys(mainByCh),
                        ...Object.keys(benefitByCh),  // ✅ include CB
                        ...Object.keys(bonusByCh),
                      ])
                    ).sort((a, b) => a.localeCompare(b));

                    if (allChannels.length === 0) {
                      return (
                        <tr>
                          <td colSpan={12} style={{ ...s.td, color: '#718096' }}>
                            No data available for this commercial.
                          </td>
                        </tr>
                      );
                    }

                    // render channel-wise: main → benefit → bonus
                    return allChannels.flatMap((ch, chIdx) => {
                      const mainRows    = mainByCh[ch]    || [];
                      const benefitRows = benefitByCh[ch] || [];
                      const bonusRows   = bonusByCh[ch]   || [];

                      const bonusRendered = bonusRows.map((r, i) => (
                        <tr key={`bonus-${ch}-${i}`} style={s.bonusRow}>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Program)}</td>
                          <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                          <td style={s.tdNowrap}>{toStr(r.Time ?? '')}</td>
                          <td style={s.td}>B</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR) * num(r.Spots))}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                          <td style={s.td}>{num(r.Spots ?? 0)}</td>
                        </tr>
                      ));

                      const sepRow = (
                        <tr key={`sep-${ch}-${chIdx}`}>
                          <td colSpan={12} style={{ padding: 0, border: 'none', height: 10 }} />
                        </tr>
                      );

                      if (!mergeBenefit) {
                        const mainRendered = mainRows.map((r, i) => (
                          <tr key={`main-${ch}-${i}`}>
                            <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                            <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Program)}</td>
                            <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                            <td style={s.tdNowrap}>{toStr(r.Time ?? '')}</td>
                            <td style={s.td}>{toStr(r.Slot ?? 'A')}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR) * num(r.Spots))}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                            <td style={s.td}>{num(r.Spots ?? 0)}</td>
                          </tr>
                        ));

                        const benefitRendered = benefitRows.map((r, i) => (
                          <tr key={`benefit-${ch}-${i}`}>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'left' }}>{toStr(r.Program)}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                            <td style={{ ...s.td, ...s.benefitRow }}>{toStr(r.Time ?? '')}</td>
                            <td style={{ ...s.td, ...s.benefitRow }}>{toStr(r.Slot ?? 'A')}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR) * num(r.Spots))}</td>
                            <td style={{ ...s.td, ...s.benefitRow, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                            <td style={{ ...s.td, ...s.benefitRow }}>{num(r.Spots ?? 0)}</td>
                          </tr>
                        ));

                        return [...mainRendered, ...benefitRendered, ...bonusRendered, sepRow];
                      } else {
                        // Merge logic: merge matching benefit into main, then sort all non-bonus rows by Slot (A before B)
                        const subKey = (r) => [
                          toStr(r.Program),
                          toStr(r.Day ?? r.Date ?? ''),
                          toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
                          toStr(r.Slot ?? 'A')
                        ].join('||').toLowerCase();

                        const mainMap = new Map();
                        mainRows.forEach(r => {
                          r = normalizeRow(r);
                          const k = subKey(r);
                          mainMap.set(k, (mainMap.get(k) || []).concat(r));
                        });

                        const unmatchedBenefit = [];
                        benefitRows.forEach(r => {
                          r = normalizeRow(r);
                          const k = subKey(r);
                          if (mainMap.has(k)) {
                            mainMap.set(k, mainMap.get(k).concat(r));
                          } else {
                            unmatchedBenefit.push(r);
                          }
                        });

                        const mergedMainRows = [];
                        mainMap.forEach((rows, k) => {
                          if (rows.length === 1) {
                            mergedMainRows.push(rows[0]);
                          } else {
                            const first = rows[0];
                            const spots = rows.reduce((a, rr) => a + num(rr.Spots ?? 0), 0);
                            const totalCost = rows.reduce((a, rr) => a + num(rr.Total_Cost ?? 0), 0);
                            const totalRating = rows.reduce((a, rr) => a + num(rr.Total_Rating ?? rr.Total_NTVR ?? 0), 0);
                            const merged = {
                              ...first,
                              Spots: spots,
                              Total_Cost: totalCost,
                              Total_Rating: totalRating,
                            };
                            mergedMainRows.push(merged);
                          }
                        });

                        // Combine merged main + unmatched benefit, then sort by Slot (A=0, B=1)
                        const allNonBonusRows = [...mergedMainRows, ...unmatchedBenefit];
                        allNonBonusRows.sort((a, b) => {
                          const slotA = toStr(a.Slot ?? 'A').toUpperCase();
                          const slotB = toStr(b.Slot ?? 'A').toUpperCase();
                          if (slotA === 'A' && slotB === 'B') return -1;
                          if (slotA === 'B' && slotB === 'A') return 1;
                          return 0; // same slot or fallback
                        });

                        // Render sorted non-bonus rows (all white for merged/main/unmatched benefit)
                        const sortedNonBonusRendered = allNonBonusRows.map((r, i) => {
                          const key = `merged-${ch}-${i}`;
                          const rowStyle = {}; // Always white for non-bonus rows when merged

                          return (
                            <tr key={key} style={rowStyle}>
                              <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Channel)}</td>
                              <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Program)}</td>
                              <td style={{ ...s.td, textAlign: 'left' }}>{toStr(r.Day ?? r.Date ?? '')}</td>
                              <td style={s.tdNowrap}>{toStr(r.Time ?? '')}</td>
                              <td style={s.td}>{toStr(r.Slot ?? 'A')}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Cost ?? r.NCost))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.NCost ?? 0))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.NTVR ?? 0))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(num(r.Total_Cost ?? 0))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.TVR ?? r.NTVR) * num(r.Spots))}</td>
                              <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(num(r.Total_Rating ?? r.Total_NTVR ?? 0))}</td>
                              <td style={s.td}>{num(r.Spots ?? 0)}</td>
                            </tr>
                          );
                        });

                        return [...sortedNonBonusRendered, ...bonusRendered, sepRow];
                      }
                    });
                  })()}
                </tbody>
            </table>
          </div>
        );
      })}

      {allCommercialKeys.length === 0 && (
        <div style={{ ...s.commercialSub, color: '#718096' }}>No commercial data available.</div>
      )}

        {/* Channel Summary (Single Table) */}
        <h3 style={s.sectionTitle}>Channel Summary</h3>
        <div style={s.summaryCard}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Channel</th>
                <th style={s.th}>Cost</th>
                <th style={s.th}>Property value</th>
                <th style={s.th}>Total Cost</th>
                <th style={s.th}>Spot Buying GRP</th>   {/* NEW */}
                <th style={s.th}>Property GRP</th>        {/* NEW */}
                <th style={s.th}>Bonus GRP</th>           {/* NEW */}
                <th style={s.th}>Total GRP</th>           {/* Already exists */}
                <th style={s.th}>Spot Buying NGRP</th>
                <th style={s.th}>Property NGRP</th>
                <th style={s.th}>Bonus NGRP</th>
                <th style={s.th}>Total NGRP</th>
                <th style={s.th}>CPRP</th>
              </tr>
            </thead>
            <tbody>
              {combinedChannelRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...s.td, textAlign: 'left' }}>{r.Channel}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Cost_LKR)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.Property_LKR)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.TotalCost_LKR)}</td>
                                    {/* NEW GRP COLUMNS */}
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(
                    (mainByProgram || []).filter(p => p.Channel === r.Channel).reduce((a,p)=>a+num(p.TVR)*num(p.Spots),0)
                  )}</td>

                <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.GRP_Property)}</td>

                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(
                    (bonusByProgram || []).filter(p => p.Channel === r.Channel).reduce((a,p)=>a+num(p.TVR)*num(p.Spots),0)
                  )}</td>
                  {/* Already in your data */}
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.GRP_Total)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Spot)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Property)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Bonus)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{safeFx(r.NGRP_Total)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{formatLKR_1(r.CPRP_LKR)}</td>
                </tr>
              ))}
              {combinedChannelRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...s.td, color: '#718096' }}>No summary available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>


      {/* Actions */}
      <div style={{marginTop: '24px'}}>
      <button
          type="button"
          onClick={() => window.history.back()}
          style={s.backHomeButton}
        >
          Go Back
        </button>
        <button type="button" onClick={() => setShowExportDialog(true)} style={s.exportButton}>
          Export Final Plan to Excel
        </button>
        <button type="button" onClick={onHome} style={s.backHomeButton}>
          Go Back to Home
        </button>
      </div>
     {showExportDialog && (
      <div style={{
        position: "fixed",
        top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999
      }}>
        <div style={{
          background: "white",
          padding: "24px",
          borderRadius: "12px",
          width: "650px",
          maxWidth: "90vw",     // responsive
          maxHeight: "70vh",
          overflowY: "auto",    // vertical scroll only
          overflowX: "hidden",  // remove horizontal scroll
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
        }}>
          <h3 style={{marginBottom: "12px"}}>Export Details</h3>
            {/* DATE RANGE (From & To in one row) */}
            <label style={{ fontWeight: 600, marginBottom: "6px", display: "block" }}>
              Activation Period
            </label>

            <div style={{ display: "flex", gap: "30px", marginBottom: "16px" }}>

              {/* From Date */}
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "13px" }}>From</label>
                <input
                  type="date"
                  style={s.inputBox}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              {/* To Date */}
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: "13px" }}>To</label>
                <input
                  type="date"
                  style={s.inputBox}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>

            </div>

              <label>Client</label>
              <input
                style={s.inputBox}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />

              <label>Activity</label>
              <div style={{
                ...s.inputBox,
                backgroundColor: '#f5f5f5',
                color: '#666',
                cursor: 'not-allowed'
              }}>
                TV Schedule
              </div>

              <label>Brand</label>
              <input
                style={s.inputBox}
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />

              <label>Campaign</label>
              <input
                style={s.inputBox}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
              />

              <label>TV Budget</label>
              <input
                type="number"
                style={s.inputBox}
                value={tvBudget}
                onChange={(e) => setTvBudget(e.target.value)}
              />

              <label>Duration</label>
              <input
                style={s.inputBox}
                value={durationName}
                onChange={(e) => setDurationName(e.target.value)}
              />

              {/* Target Group (existing logic – DO NOT CHANGE) */}
              <label>Selected Target Group</label>
              <div style={{
                ...s.inputBox,
                backgroundColor: '#f5f5f5',
                color: '#666',
                cursor: 'not-allowed'
              }}>
                {getTGLabel(selectedTG)}
              </div>

              <label>Ref No</label>
              <input
                style={s.inputBox}
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
              />

              <hr style={{margin: "16px 0"}} />

                <h4>Commercial Names</h4>
                {allCommercialKeys.map((key, index) => {
                  const defaultName = `Commercial ${index + 1}`;
                  return (
                    <div key={key} style={{ marginBottom: "12px" }}>

                      {/* wrapper row */}
                      <div style={{ display: "flex", gap: "30px" }}>

                        {/* Commercial name input (wide) */}
                        <div style={{ flex: 2 }}>
                          <label>{defaultName}</label>
                          <input
                            style={s.inputBox}
                            placeholder={`Enter name for ${defaultName}`}
                            required
                            value={commercialNames[key] || ""}
                            onChange={(e) => {
                              setCommercialNames(prev => ({
                                ...prev,
                                [key]: e.target.value
                              }));
                            }}
                          />
                        </div>

                        {/* Language dropdown (smaller) */}
                        <div style={{ flex: 1 }}>
                          <label>Language</label>
                        <select
                          style={{
                            ...s.inputBox,
                            height: "35px",
                            padding: "8px",          // match input box padding
                            border: "1px solid #ccc",
                            borderRadius: "6px",
                            fontSize: "14px",
                            backgroundColor: "white", // avoid grey look
                            appearance: "none",       // cleaner dropdown
                            WebkitAppearance: "none",
                            MozAppearance: "none"
                          }}
                          value={commercialLanguages[key] || ""}
                          onChange={(e) => {
                            setCommercialLanguages(prev => ({
                              ...prev,
                              [key]: e.target.value
                            }));
                          }}
                        >
                          <option value="">Select</option>
                          <option value="Sinhala">Sinhala</option>
                          <option value="English">English</option>
                          <option value="Tamil">Tamil</option>
                        </select>
                        </div>

                      </div>

                    </div>
                  );
                })}


             <div style={{marginTop:"20px", textAlign:"right"}}>
                <button
                  style={s.backHomeButton}
                  onClick={() => setShowExportDialog(false)}
                >
                  Cancel
                </button>

                <button
                  style={s.primaryButton}
                  onClick={async () => {
                    const ok = await savePlan();
                    if (ok) {
                      setShowExportDialog(false);
                      await handleExport(false); // normal export
                    }
                  }}
                >
                  Save & Export
                </button>

                <button
                  style={{ ...s.primaryButton, backgroundColor: '#2d3748', marginLeft: '10px' }}
                  onClick={async () => {
                    const ok = await savePlan();
                    if (ok) {
                      setShowExportDialog(false);
                      await handleExport(true); // export with formulas
                    }
                  }}
                >
                  Save & Export with Formulas
                </button>

            </div>
         </div>
          </div>
        )}
    </div>
  );
}