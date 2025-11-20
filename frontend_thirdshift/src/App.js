// src/App.js
import React, { useState, useMemo } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

import Header from './components/Header';
import Footer from './components/Footer';

// Core flow
import FrontPage from './components/FrontPage';
import ChannelSelector from './components/ChannelSelector';
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
import ScrollToTop from "./components/ScrollToTop";

function App() {
  const navigate = useNavigate();

  // Keep ALL states EXACTLY as before
  const [negotiatedRates, setNegotiatedRates] = useState({});
  const [channelDiscounts, setChannelDiscounts] = useState({});
  const [selectedTG, setSelectedTG] = useState("tvr_all");
  const [channelMoney, setChannelMoney] = useState({});
  const [benefitResult, setBenefitResult] = useState(null);
  const [allocatorState, setAllocatorState] = useState(null);


  const hasAnyComBenefit = useMemo(
    () =>
      Object.values(channelMoney || {}).some(
        (v) => (v?.comBenefit || 0) > 0
      ),
    [channelMoney]
  );

  const handleBenefitResultReady = (res) => {
    setBenefitResult(res || null);
  };

  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [optimizationInput, setOptimizationInput] = useState(null);
  const [dfFull, setDfFull] = useState([]);
  const [channels, setChannels] = useState([]);
  const [basePlanResult, setBasePlanResult] = useState(null);
  const [basePlanForFinal, setBasePlanForFinal] = useState(null);
  const [basePlanInclusiveTotals, setBasePlanInclusiveTotals] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [propertyProgramsForFinal, setPropertyProgramsForFinal] = useState({});

  const [bonusSharesInput, setBonusSharesInput] = useState(null);
  const [bonusResult, setBonusResult] = useState(null);
  const [bonusReadyRows, setBonusReadyRows] = useState([]);

  const [selectedBonusPrograms, setSelectedBonusPrograms] = useState({});
  const [benefitState, setBenefitState] = useState(null);
  const [bonusSetupState, setBonusSetupState] = useState(null);


  // ---- Navigation helper replacements ----

  const handleProgramsSubmit = (programIds) => {
    setSelectedProgramIds(programIds || []);
    navigate('/optimization-setup');
  };

  const handleOptimizationSubmit = (data) => {
    console.log('Data received in handleOptimizationSubmit:', data);
    console.log('Channel money in data:', data?.channelMoney);

    setOptimizationInput(data || null);
    setChannelMoney(data?.channelMoney || {});
    navigate('/df-preview');
  };

  const handleDfReady = (df) => {
    const safeDf = df || [];
    setDfFull(safeDf);

    const chs = Array.from(new Set(safeDf.map(r => r.Channel))).filter(Boolean);
    setChannels(chs);

    navigate('/base-plan');
  };

  const handleBasePlanReady = (payload) => {
    setBasePlanResult(payload?.raw || null);
    setBasePlanForFinal(payload?.final || null);
    setBasePlanInclusiveTotals(payload?.inclusiveTotals || null);
    setPropertyProgramsForFinal(payload?.propertyPrograms || {});
    setShowResults(true);
  };

  const handleProceedToBonusSelector = () => {
    setSelectedBonusPrograms({});
    setShowResults(false);
    navigate('/bonus-selector');
  };

  const handleBonusProgramSubmitFromRows = () => {
    navigate('/bonus-setup');
  };

  const handleBonusSharesSubmit = (sharesInput) => {
    setBonusSharesInput(sharesInput || {});
    navigate('/bonus-preview');
  };

  const handleBonusResultReady = (res) => {
    const safe = res || { total_cost: 0, total_rating: 0, rows: [] };
    setBonusResult(safe);
  };

  const handleProceedToFinalPlan = () => navigate('/final-plan');

  return (
    <div>
      <Header />
      <ScrollToTop />
      <main style={{ padding: '20px', minHeight: '80vh' }}>

        {/** ROUTING STARTS HERE */}
        <Routes>

          {/** STEP 0 */}
          <Route
            path="/"
            element={
              <FrontPage
                onStart={() => navigate('/select-channels')}
                onManagePrograms={() => navigate('/program-updater')}
              />
            }
          />
          <Route
          path="/select-channels"
          element={
            <ChannelSelector
              initialSelectedChannels={channels}   // ⭐ RESTORE SELECTION WHEN COMING BACK
              onBack={() => navigate('/')}
              onProceed={(chs) => {
                setChannels(chs);
                navigate('/negotiated');
              }}
            />
          }
        />

          {/** STEP 1 */}
        <Route
          path="/negotiated"
          element={
            <NegotiatedRates
              channels={channels}
              selectedChannels={channels}

              /** ⬇⬇⬇ ADD THESE THREE LINES ⬇⬇⬇ */
              initialChannelDiscounts={channelDiscounts}
              initialNegotiatedRates={negotiatedRates}
              initialTG={selectedTG}

              onBack={() => navigate('/select-channels')}

              onProceed={({ channelDiscounts: cd = {}, negotiatedRates: nr = {}, selectedTG: tg }) => {
                setChannelDiscounts(cd);
                setNegotiatedRates(nr);
                setSelectedTG(tg);
                navigate('/program-selector');
              }}
            />
          }
        />
          {/** STEP 2 */}
        <Route
          path="/program-selector"
          element={
            <ProgramSelector
              negotiatedRates={negotiatedRates}
              selectedChannels={channels}
              selectedTG={selectedTG}

              /** ⬇⬇⬇ ADD THIS ⬇⬇⬇ */
              initialSelectedProgramIds={selectedProgramIds}

              onSubmit={handleProgramsSubmit}
              onBack={() => navigate('/negotiated')}
            />
          }
        />

          {/** STEP 3 */}
          <Route
            path="/optimization-setup"
            element={
              <OptimizationSetup
                onSubmit={handleOptimizationSubmit}
                onBack={() => navigate('/program-selector')}
                initialValues={optimizationInput}
                selectedTG={selectedTG}
              />
            }
          />

          {/** STEP 4 */}
          <Route
            path="/df-preview"
            element={
              <DfPreview
                programIds={selectedProgramIds}
                optimizationInput={optimizationInput}
                negotiatedRates={negotiatedRates}
                channelDiscounts={channelDiscounts}
                selectedTG={selectedTG}
                onReady={handleDfReady}
                goBack={() => navigate('/optimization-setup')}
              />
            }
          />

          {/** STEP 5 */}
          <Route
            path="/base-plan"
            element={
              <div>
                <ChannelRatingAllocator
                  channels={channels}
                  dfFull={dfFull}
                  optimizationInput={optimizationInput || {}}
                  initialState={allocatorState}   // ⭐ ADD THIS
                  onSaveState={setAllocatorState} // ⭐ ADD THIS
                  onBack={() => navigate('/df-preview')}
                  onResultReady={handleBasePlanReady}
                  onProceedToBonus={() =>
                    hasAnyComBenefit
                      ? navigate('/commercial-benefit')
                      : handleProceedToBonusSelector()
                  }
                  onChannelMoney={(cm) => setChannelMoney(cm)}
                />

                {showResults && basePlanResult && (
                  <div style={{ marginTop: "32px" }}>
                    <OptimizationResults
                      result={basePlanResult}
                      displayOrder={[
                        'Channel','Program','Day','Time','Slot','Cost','TVR',
                        'NCost','NTVR','Total_Cost','GRP','Total_Rating','Spots'
                      ]}
                      summaryOrder={[
                        'Channel','Total_Cost','% Cost','GRP','GRP %','Total_Rating','% Rating',
                        'Prime Cost','Prime Cost %','Non-Prime Cost','Non-Prime Cost %',
                        'Prime Rating','Non-Prime Rating'
                      ]}
                      formatLKR={(n) =>
                        `Rs. ${Number(n || 0).toLocaleString("en-LK", {
                          maximumFractionDigits: 2,
                        })}`
                      }
                      inclusiveTotals={basePlanInclusiveTotals}
                      channels={channels}
                      propertyPrograms={propertyProgramsForFinal}
                      onProceedToBonus={() =>
                        hasAnyComBenefit
                          ? navigate('/commercial-benefit')
                          : handleProceedToBonusSelector()
                      }
                      proceedLabel={
                        hasAnyComBenefit
                          ? "Proceed to Commercial Benefit Optimization"
                          : "Proceed to Bonus Program Optimization"
                      }
                      onBackToInputs={() => {
                          setShowResults(false);   // ⭐ hide results section
                          navigate('/df-preview');  // ⭐ go back to form
                        }}
                      onExport={() => {}}
                    />
                  </div>
                )}
              </div>
            }
          />

          {/** STEP 6 */}
          <Route
            path="/commercial-benefit"
            element={
              <CommercialBenefitSetup
                channels={channels}
                dfFull={dfFull}
                channelMoney={channelMoney}
                optimizationInput={optimizationInput}
                initialState={benefitState}
                onSaveState={setBenefitState}
                  onBack={() => {
                    setShowResults(false);
                    navigate('/base-plan');
                  }}
                onProceedToBonus={handleProceedToBonusSelector}
                onHome={() => navigate('/')}
                onResultReady={handleBenefitResultReady}
              />
            }
          />

          {/** STEP 7 */}
          <Route
            path="/bonus-selector"
            element={
              <BonusProgramSelector
                channels={channels}
                allDbPrograms={dfFull}
                selectedBonusPrograms={selectedBonusPrograms}
                setSelectedBonusPrograms={setSelectedBonusPrograms}
                onNext={handleBonusProgramSubmitFromRows}
                onBack={() =>
                  hasAnyComBenefit
                    ? navigate('/commercial-benefit')
                    : navigate('/base-plan')
                }
              />
            }
          />

          {/** STEP 8 */}
          <Route
            path="/bonus-setup"
            element={
              <BonusChannelBudgetSetup
                channels={channels}
                channelMoney={channelMoney}
                optimizationInput={optimizationInput}
                initialState={bonusSetupState}
                onSaveState={setBonusSetupState}
                onBack={() => navigate('/bonus-selector')}
                onProceed={handleBonusSharesSubmit}
              />
            }
          />

          {/** STEP 9 */}
          <Route
            path="/bonus-preview"
            element={
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
                onBack={() => navigate('/bonus-setup')}
                commercialTolerancePct={bonusSharesInput?.commercialTolerancePct ?? 0.05}
                formatLKR={(n) =>
                  `${Number(n || 0).toLocaleString("en-LK", {
                    maximumFractionDigits: 2,
                  })}`
                }
                onBackToSetup={() => navigate('/bonus-setup')}
                onProceedToFinalPlan={() => navigate('/final-plan')}
                setBonusOptimizationResult={handleBonusResultReady}
              />
            }
          />

          {/** STEP 10 */}
          <Route
            path="/bonus-results"
            element={
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
                onBack={() => navigate('/bonus-preview')}
                onNext={handleProceedToFinalPlan}
              />
            }
          />

        {/** STEP 11 */}
        <Route
          path="/final-plan"
          element={(() => {

            // ⭐ FIX: Convert durations ARRAY → OBJECT (if needed)
            const mappedOptimizationInput = optimizationInput
              ? {
                  ...optimizationInput,
                  durations: Array.isArray(optimizationInput.durations)
                    ? optimizationInput.durations.reduce((m, d, i) => {
                        m[`COM_${i + 1}`] = Number(d) || 0;
                        return m;
                      }, {})
                    : optimizationInput.durations
                }
              : null;

            return (
              <FinalPlan
                mainResults={
                  basePlanForFinal
                    ? { ...basePlanForFinal, inclusiveTotals: basePlanInclusiveTotals }
                    : {
                        tables: {
                          by_program: basePlanResult?.df_result || [],
                          by_channel: basePlanResult?.channel_summary || [],
                        },
                        commercials_summary: basePlanResult?.commercials_summary || [],
                        totals: { total_rating: basePlanResult?.total_rating || 0 },
                        inclusiveTotals: basePlanInclusiveTotals,
                      }
                }
                benefitResults={
                  benefitResult || {
                    totals: { benefit_total_rating: 0 },
                    tables: { by_program: [], by_channel: [] },
                  }
                }
                bonusResults={
                  bonusResult || {
                    totals: { bonus_total_rating: 0 },
                    tables: { by_program: [], by_channel: [] },
                  }
                }
                totalBudgetInclProperty={
                  basePlanInclusiveTotals?.totalBudgetIncl ??
                  basePlanForFinal?.totals?.total_cost_incl_property ??
                  basePlanForFinal?.totals?.total_budget_incl_property ??
                  (basePlanResult?.total_cost ?? 0)
                }
                propertyPrograms={propertyProgramsForFinal}
                selectedTG={selectedTG}
                optimizationInput={mappedOptimizationInput}   // ⭐ FIXED VALUE GOES HERE
                onBack={() => navigate('/bonus-results')}
                onHome={() => navigate('/')}
              />
            );
          })()}
        />


          {/** STEP 12 */}
          <Route
            path="/program-updater"
            element={<ProgramUpdater onBack={() => navigate('/')} />}
          />

        </Routes>

      </main>

      <Footer />
    </div>
  );
}

export default App;