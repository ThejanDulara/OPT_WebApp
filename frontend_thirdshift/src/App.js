// src/App.js
import React, { useState, useMemo } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';

// Core flow
import FrontPage from './components/FrontPage';
import NegotiatedRates from './components/NegotiatedRates';
import ProgramSelector from './components/ProgramSelector';
import OptimizationSetup from './components/OptimizationSetup';
import DfPreview from './components/DfPreview';
import ChannelRatingAllocator from './components/ChannelRatingAllocator';
import ProgramUpdater from './components/ProgramUpdater';
import OptimizationResults from './components/OptimizationResults';

// Bonus flow
import BonusProgramSelector from './components/BonusProgramSelector';
import BonusChannelBudgetSetup from './components/BonusChannelBudgetSetup';
import BonusDfPreview from './components/BonusDfPreview';
import BonusResults from './components/BonusResults';
import FinalPlan from './components/FinalPlan';

import CommercialBenefitSetup from './components/CommercialBenefitSetup';
import CommercialBenefitResults from './components/CommercialBenefitResults';

function App() {
  // -------- Global step --------
  const [step, setStep] = useState(0);

  // Negotiated rates / discounts
  const [negotiatedRates, setNegotiatedRates] = useState({});
  const [channelDiscounts, setChannelDiscounts] = useState({});
  const [channelMoney, setChannelMoney] = useState({});

  // NEW: Commercial Benefit route + result cache (optional)
    const [benefitResult, setBenefitResult] = useState(null);
    const [benefitSetupCache, setBenefitSetupCache] = useState(null); // optional, if you want to persist edits

    // Is there any channel with Com. Benefit > 0?
    const hasAnyComBenefit = useMemo(
      () => Object.values(channelMoney || {}).some(v => (v?.comBenefit || 0) > 0),
      [channelMoney]
    );

    // Navigation helpers for the new step (if you use them)
    const handleProceedToBenefit = () => setStep(6);
    const handleBenefitResultReady = (res) => {
      setBenefitResult(res || null);
      // after CB optimization, continue to Bonus flow
    };


  // Base optimization state
  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [optimizationInput, setOptimizationInput] = useState(null);
  const [dfFull, setDfFull] = useState([]);
  const [channels, setChannels] = useState([]);
  const [basePlanResult, setBasePlanResult] = useState(null);     // RAW for step 6
  const [basePlanForFinal, setBasePlanForFinal] = useState(null); // ADAPTED for step 11
  const [basePlanInclusiveTotals, setBasePlanInclusiveTotals] = useState(null);
  const [showResults, setShowResults] = useState(false); // NEW: Control results visibility
  const [propertyProgramsForFinal, setPropertyProgramsForFinal] = useState({});

  // Bonus flow state
  const [bonusSelectedIds, setBonusSelectedIds] = useState([]);   // consumed by BonusDfPreview
  const [bonusSharesInput, setBonusSharesInput] = useState(null);
  const [bonusDfFull, setBonusDfFull] = useState([]);
  const [bonusResult, setBonusResult] = useState(null);
  const [channelBudgetData, setChannelBudgetData] = useState({});
  const [bonusReadyRows, setBonusReadyRows] = useState([]);

  // NEW: selector uses rows by channel; we keep them and later derive IDs for your existing pipeline
  const [selectedBonusPrograms, setSelectedBonusPrograms] = useState({}); // { [channel]: Array<row> }

  // -------- Core handlers --------
  const handleProgramsSubmit = (programIds) => {
    setSelectedProgramIds(programIds || []);
    setStep(3);
  };

  const handleOptimizationSubmit = (data) => {
    console.log('Data received in handleOptimizationSubmit:', data);
    console.log('Channel money in data:', data?.channelMoney);

    setOptimizationInput(data || null);
    setChannelMoney(data?.channelMoney || {});
    setStep(4);
  };

  const handleDfReady = (df) => {
    const safeDf = df || [];
    setDfFull(safeDf);

    const chs = Array.from(new Set(safeDf.map(r => r.Channel))).filter(Boolean);
    setChannels(chs);

    setStep(5);
  };

  // From ChannelRatingAllocator when the base optimization result is ready
  const handleBasePlanReady = (payload) => {
    // payload = { raw, final, inclusiveTotals }
    setBasePlanResult(payload?.raw || null);                 // use RAW in step 6
    setBasePlanForFinal(payload?.final || null);             // use ADAPTED in step 11
    setBasePlanInclusiveTotals(payload?.inclusiveTotals || null);
    setPropertyProgramsForFinal(payload?.propertyPrograms || {});
    setShowResults(true); // Show results alongside setup
  };


  // -------- Helper: derive IDs for BonusDfPreview from selected rows --------
  const extractIdsFromSelected = (selectedByChannel, fullRows) => {
    const ids = [];
    if (!selectedByChannel || !fullRows) return ids;

    // Build a quick index on dfFull by a composite key of common fields
    const keyOf = (r) => {
      const toStr = (v) => (v === null || v === undefined ? '' : String(v));
      return [
        toStr(r.Channel),
        toStr(r.Program),
        toStr(r.Day ?? r.Date ?? ''),
        toStr(r.Time ?? r.Start_Time ?? r.StartTime ?? ''),
        toStr(r.Duration ?? r.DURATION ?? r.Dur ?? ''),
        toStr(r.Slot ?? '')
      ].join('||');
    };

    const indexByKey = new Map();
    fullRows.forEach((r, idx) => indexByKey.set(keyOf(r), idx)); // use index as fallback id

    Object.values(selectedByChannel).forEach((rows = []) => {
      rows.forEach((r) => {
        // Prefer explicit IDs if present
        const explicitId = r.id ?? r._id ?? r.ID ?? r.Id;
        if (explicitId !== undefined && explicitId !== null) {
          ids.push(explicitId);
          return;
        }
        // Fallback: map to first matching dfFull index via composite key
        const k = keyOf(r);
        if (indexByKey.has(k)) {
          ids.push(indexByKey.get(k));
        }
      });
    });

    return ids;
  };

  // -------- Bonus handlers --------
  // Called by the button inside OptimizationResults.jsx
  const handleProceedToBonusSelector = () => {
    setBonusSelectedIds([]);            // fresh selection for bonus
    setSelectedBonusPrograms({});       // clear any prior row selections
    setStep(7);
    setShowResults(false); // Hide results when moving to bonus
  };

  // If a component still gives us IDs directly, keep this path
  const handleBonusProgramSubmit = (ids) => {
    setBonusSelectedIds(ids || []);
    setStep(8); // go to BonusChannelBudgetSetup
  };

  // Used when the selector finishes (it calls onNext, not onSubmit)
  const handleBonusProgramSubmitFromRows = () => {
    const ids = extractIdsFromSelected(selectedBonusPrograms, dfFull);
    setBonusSelectedIds(ids);
    setStep(8);
  };

  const handleBonusSharesSubmit = (sharesInput) => {
    setBonusSharesInput(sharesInput || {});
    setStep(9); // build bonus-ready table
  };

  const handleBonusDfReady = (df) => {
    setBonusDfFull(df || []);
    setStep(10); // bonus optimization results
  };

  const handleBonusResultReady = (res) => {
    const safe = res || { total_cost: 0, total_rating: 0, rows: [] };
    setBonusResult(safe);
  };

  const handleProceedToFinalPlan = () => setStep(11);

    // -------- Render by step --------
    const renderStep = () => {
      switch (step) {
        case 0: /* FrontPage */
          return (
            <FrontPage onStart={() => setStep(1)} onManagePrograms={() => setStep(12)} />
          );

        case 1: /* NegotiatedRates */
          return (
            <NegotiatedRates
              onBack={() => setStep(0)}
              onProceed={({ channelDiscounts: cd = {}, negotiatedRates: nr = {} }) => {
                setChannelDiscounts(cd);
                setNegotiatedRates(nr);
                setStep(2);
              }}
            />
          );

        case 2: /* ProgramSelector */
          return (
            <ProgramSelector
              negotiatedRates={negotiatedRates}
              onSubmit={handleProgramsSubmit}
              onBack={() => setStep(1)}
            />
          );

        case 3: /* OptimizationSetup */
          return (
            <OptimizationSetup
              onSubmit={handleOptimizationSubmit}
              onBack={() => setStep(2)}
              initialValues={optimizationInput}
            />
          );

        case 4: /* DfPreview */
          return (
            <DfPreview
              programIds={selectedProgramIds}
              optimizationInput={optimizationInput}
              negotiatedRates={negotiatedRates}
              channelDiscounts={channelDiscounts}
              onReady={handleDfReady}
              goBack={() => setStep(3)}
            />
          );

        case 5: /* Base setup + inline results */
          return (
            <div>
              <ChannelRatingAllocator
                channels={channels}
                dfFull={dfFull}
                optimizationInput={optimizationInput}
                onBack={() => setStep(4)}
                onResultReady={handleBasePlanReady}
                onProceedToBonus={() =>
                  hasAnyComBenefit ? handleProceedToBenefit() : handleProceedToBonusSelector()
                }
                onChannelMoney={(cm) => setChannelMoney(cm)}
              />

              {showResults && basePlanResult && (
                <div style={{ marginTop: '32px' }}>
                  <OptimizationResults
                    result={basePlanResult || { total_cost: 0, total_rating: 0, df_result: [], channel_summary: [] }}
                    displayOrder={[
                      'Channel','Program','Day','Time','Slot','Cost','TVR','NCost','NTVR','Total_Cost','Total_Rating','Spots'
                    ]}
                    summaryOrder={[
                      'Channel','Total_Cost','% Cost','Total_Rating','% Rating',
                      'Prime Cost','Prime Cost %','Non-Prime Cost','Non-Prime Cost %','Prime Rating','Non-Prime Rating'
                    ]}
                    formatLKR={(n) => `Rs. ${Number(n||0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`}
                    styles={{}}
                    inclusiveTotals={basePlanInclusiveTotals || {}}
                    channels={channels}
                    propertyPrograms={[]}
                    onProceedToBonus={() =>
                      hasAnyComBenefit ? handleProceedToBenefit() : handleProceedToBonusSelector()
                    }
                    proceedLabel={
                      hasAnyComBenefit
                        ? "Proceed to Commercial Benefit Optimization"
                        : "Proceed to Bonus Program Optimization"
                    }
                    onHome={() => setStep(0)}
                    onExport={() => {}}
                  />
                </div>
              )}
            </div>
          );

        case 6: /* Commercial Benefit Setup + inline results */
          return (
            <CommercialBenefitSetup
              channels={channels}
              dfFull={dfFull}
              channelMoney={channelMoney} // includes chAmount/prop/onCost/comBenefit/available
              optimizationInput={optimizationInput}
              onBack={() => setStep(5)}
              onProceedToBonus={handleProceedToBonusSelector} // 👈 allow CB results to jump to Bonus
              onHome={() => setStep(0)}
              onResultReady={handleBenefitResultReady} // still store result for Final Plan
            />
          );

        case 7: /* BONUS: Select Slot-B programs */
          return (
            <BonusProgramSelector
              channels={channels || []}
              allDbPrograms={dfFull}
              selectedBonusPrograms={selectedBonusPrograms}
              setSelectedBonusPrograms={setSelectedBonusPrograms}
              onNext={handleBonusProgramSubmitFromRows}
              onBack={() => setStep(hasAnyComBenefit ? 6 : 5)}
            />
          );

        case 8: /* BONUS: Setup */
          return (
            <BonusChannelBudgetSetup
              channels={channels}
              channelMoney={channelMoney}
              optimizationInput={optimizationInput}
              onBack={() => setStep(7)}
              onProceed={handleBonusSharesSubmit}
            />
          );

        case 9: /* BONUS: Build bonus df */
          return (
            <BonusDfPreview
              channels={channels}
              selectedBonusPrograms={selectedBonusPrograms}
              bonusBudgetsByChannel={bonusSharesInput?.bonusBudget || {}}
              bonusCommercialPercentsByChannel={(bonusSharesInput?.budgetProportions || []).reduce((m, pct, i) => {
                m[`com_${i + 1}`] = Number(pct) || 0;
                return m;
              }, {})}
              commercialDurationsByChannel={(bonusSharesInput?.durations || []).reduce((m, dur, i) => {
                m[`com_${i + 1}`] = Number(dur) || 30;
                return m;
              }, {})}
              maxSpots={bonusSharesInput?.maxSpots ?? 20}
              channelAllowPctByChannel={bonusSharesInput?.channelAllowPctByChannel || {}}
              defaultChannelAllowPct={bonusSharesInput?.defaultChannelAllowPct ?? 0.10}
              timeLimitSec={bonusSharesInput?.timeLimitSec ?? 120}
              setBonusReadyRows={setBonusReadyRows}
              onBack={() => setStep(8)}
              commercialTolerancePct={bonusSharesInput?.commercialTolerancePct ?? 0.05}
              formatLKR={(n) => `${Number(n||0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`}
              onBackToSetup={() => setStep(8)}
              onProceedToFinalPlan={() => setStep(11)}
              setBonusOptimizationResult={handleBonusResultReady}
            />
          );

        case 10: /* BONUS: Results */
          return (
            <BonusResults
              channels={channels}
              bonusReadyRows={bonusReadyRows}
              bonusBudgetsByChannel={bonusSharesInput?.bonusBudget || {}}
              bonusCommercialPercentsByChannel={
                bonusSharesInput?.perChannelPercents ||
                (Array.isArray(bonusSharesInput?.budgetProportions)
                  ? bonusSharesInput.budgetProportions.reduce((m, pct, i) => {
                      m[`com_${i + 1}`] = Number(pct) || 0;
                      return m;
                    }, {})
                  : {})
              }
              bonusChannelAllowPctByChannel={bonusSharesInput?.channelAllowPctByChannel || {}}
              timeLimit={bonusSharesInput?.timeLimit || 120}
              maxSpots={bonusSharesInput?.maxSpots || 20}
              setBonusOptimizationResult={handleBonusResultReady}
              onBack={() => setStep(9)}
              onNext={handleProceedToFinalPlan}
            />
          );

        case 11: /* Final Plan */ {
          const toNum = (v) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
          const propertyBudgetSum = Object.values(propertyProgramsForFinal || {}).reduce((acc, arr) => {
            if (!Array.isArray(arr)) return acc;
            return acc + arr.reduce((a, r) => a + toNum(r.budget ?? r.Budget), 0);
          }, 0);

          const totalBudgetIncl =
            basePlanInclusiveTotals?.totalBudgetIncl ??
            basePlanForFinal?.totals?.total_cost_incl_property ??
            basePlanForFinal?.totals?.total_budget_incl_property ??
            ((basePlanResult?.total_cost ?? 0) + propertyBudgetSum);

          return (
            <FinalPlan
              // Main Optimization
              mainResults={
                basePlanForFinal
                  ? { ...basePlanForFinal, inclusiveTotals: basePlanInclusiveTotals || null }
                  : {
                      tables: {
                        by_program: basePlanResult?.df_result || [],
                        by_channel: basePlanResult?.channel_summary || [],
                      },
                      commercials_summary: basePlanResult?.commercials_summary || [],
                      totals: { total_rating: basePlanResult?.total_rating || 0 },
                      inclusiveTotals: basePlanInclusiveTotals || null,
                    }
              }

              // Commercial Benefit Optimization (NEW)
              benefitResults={
                benefitResult || {
                  totals: { benefit_total_rating: 0 },
                  tables: { by_program: [], by_channel: [] },
                }
              }

              // Bonus Optimization
              bonusResults={
                bonusResult || {
                  totals: { bonus_total_rating: 0 },
                  tables: { by_program: [], by_channel: [] },
                }
              }

              totalBudgetInclProperty={totalBudgetIncl}
              propertyPrograms={propertyProgramsForFinal}
              onBack={() => setStep(10)}
              onHome={() => setStep(9)}
            />
          );
        }

        case 12: /* ProgramUpdater */
          return <ProgramUpdater onBack={() => setStep(0)} />;

        default:
          return null;
      }
    };

  return (
    <div>
      <Header />
      <main style={{ padding: '20px', minHeight: '80vh' }}>
        {renderStep()}
      </main>
      <Footer />
    </div>
  );
}

export default App;