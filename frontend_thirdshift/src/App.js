import React, { useState } from 'react';
import ProgramSelector from './components/ProgramSelector';
import OptimizationSetup from './components/OptimizationSetup';
import DfPreview from './components/DfPreview';
import ChannelRatingAllocator from './components/ChannelRatingAllocator';
import FrontPage from './components/FrontPage';
import ProgramUpdater from './components/ProgramUpdater';
import Header from './components/Header';
import Footer from './components/Footer';
import NegotiatedRates from './components/NegotiatedRates';

function App() {
  const [step, setStep] = useState(0);
  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [optimizationInput, setOptimizationInput] = useState(null);
  const [dfFull, setDfFull] = useState([]);
  const [negotiatedRates, setNegotiatedRates] = useState({});
  const [channelDiscounts, setChannelDiscounts] = useState({});

  const handleProgramsSubmit = (programIds) => {
    setSelectedProgramIds(programIds);
    setStep(3);
  };

  const handleOptimizationSubmit = (data) => {
    setOptimizationInput(data);
    setStep(4);
  };

  const handleDfReady = (df) => {
    setDfFull(df);
    setStep(5);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <FrontPage
            onStart={() => setStep(1)}
            onManagePrograms={() => setStep(6)}
          />
        );
        case 1:
          return (
            <NegotiatedRates
              onBack={() => setStep(0)}
              onProceed={({ channelDiscounts, negotiatedRates }) => {
                setNegotiatedRates(negotiatedRates);
                setChannelDiscounts(channelDiscounts);
                setStep(2);
              }}
            />
          );
        case 2:
          return (
            <ProgramSelector
              negotiatedRates={negotiatedRates}
              onSubmit={handleProgramsSubmit}
              onBack={() => setStep(1)}
            />
          );
      case 3:
        return (
          <OptimizationSetup
            onSubmit={handleOptimizationSubmit}
            onBack={() => setStep(2)}
            initialValues={optimizationInput}
          />
        );
      case 4:
        return (
          <DfPreview
            programIds={selectedProgramIds}
            optimizationInput={optimizationInput}
            negotiatedRates={negotiatedRates}      // ✅ pass down
            channelDiscounts={channelDiscounts}    // ✅ pass down
            onReady={handleDfReady}
            goBack={() => setStep(3)}
          />
        );
      case 5:
        return (
          <ChannelRatingAllocator
            channels={[...new Set(dfFull.map(row => row.Channel))]}
            dfFull={dfFull}
            optimizationInput={optimizationInput}
            onBack={() => setStep(4)}
          />
        );
      case 6:
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
