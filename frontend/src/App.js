import React, { useState } from 'react';
import ProgramSelector from './components/ProgramSelector';
import OptimizationSetup from './components/OptimizationSetup';
import DfPreview from './components/DfPreview';
import ChannelRatingAllocator from './components/ChannelRatingAllocator';
import FrontPage from './components/FrontPage';
import ProgramUpdater from './components/ProgramUpdater';
import Header from './components/Header';
import Footer from './components/Footer';

function App() {
  const [step, setStep] = useState(0);
  const [selectedProgramIds, setSelectedProgramIds] = useState([]);
  const [optimizationInput, setOptimizationInput] = useState(null);
  const [dfFull, setDfFull] = useState([]);

  const handleProgramsSubmit = (programIds) => {
    setSelectedProgramIds(programIds);
    setStep(2);
  };

  const handleOptimizationSubmit = (data) => {
    setOptimizationInput(data);
    setStep(3);
  };

  const handleDfReady = (df) => {
    setDfFull(df);
    setStep(4);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <FrontPage
            onStart={() => setStep(1)}
            onManagePrograms={() => setStep(5)}
          />
        );
      case 1:
        return (
          <ProgramSelector
            onSubmit={handleProgramsSubmit}
            onBack={() => setStep(0)}
          />
        );
      case 2:
        return (
          <OptimizationSetup
            onSubmit={handleOptimizationSubmit}
            onBack={() => setStep(1)}
            initialValues={optimizationInput}
          />
        );
      case 3:
        return (
          <DfPreview
            programIds={selectedProgramIds}
            optimizationInput={optimizationInput}
            onReady={handleDfReady}
            goBack={() => setStep(2)}
          />
        );
      case 4:
        return (
          <ChannelRatingAllocator
            channels={[...new Set(dfFull.map(row => row.Channel))]}
            dfFull={dfFull}
            optimizationInput={optimizationInput}
            onBack={() => setStep(3)}
          />
        );
      case 5:
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
