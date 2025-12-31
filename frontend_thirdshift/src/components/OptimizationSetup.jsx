import React, { useState } from 'react';

function OptimizationSetup({ onSubmit, onBack, initialValues }) {
   const formatWithCommas = (value) => {
      if (value === '' || value === null || value === undefined) return '';
      return Number(value).toLocaleString('en-LK');
    };

    const removeCommas = (value) => {
      return value.replace(/,/g, '');
    };
  const [numCommercials, setNumCommercials] = useState(initialValues?.numCommercials || 1);
  const [durations, setDurations] = useState(initialValues?.durations || ['']);
  const [budgetProportions, setBudgetProportions] = useState(initialValues?.budgetProportions || [100]);
  const [budget, setBudget] = useState(initialValues?.budget || '');
  const [budgetBound, setBudgetBound] = useState(initialValues?.budgetBound || 1000);
  const [minSpots, setMinSpots] = useState(initialValues?.minSpots || 0);
  const [maxSpots, setMaxSpots] = useState(initialValues?.maxSpots || 10);
  const [timeLimit, setTimeLimit] = useState(initialValues?.timeLimit || 120); // seconds

  const handleDurationChange = (index, value) => {
    const newDurations = [...durations];
    newDurations[index] = value;
    setDurations(newDurations);
  };

  const handleBudgetProportionChange = (index, value) => {
    const newBudgets = [...budgetProportions];
    newBudgets[index] = value;
    setBudgetProportions(newBudgets);
  };

  const handleNumCommercialsChange = (e) => {
    const count = parseInt(e.target.value);
    setNumCommercials(count);

    // Durations setup (preserve or create)
    const newDurations = initialValues?.durations?.slice(0, count) || [];
    while (newDurations.length < count) newDurations.push('');
    setDurations(newDurations);

    // === Default Budget Split ===
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    const defaultBudgets = Array(count).fill(base);
    if (remainder > 0) {
      defaultBudgets[count - 1] += remainder;
    }
    setBudgetProportions(defaultBudgets);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const time = parseInt(timeLimit);

    if (time < 60) {
      alert("⏱ Optimization time limit must be at least 60 seconds.");
      return;
    }

    if (time > 599) {
      const confirmProceed = window.confirm("⚠️ You've set the time limit over 10 minutes.\n\nThe optimization will keep running on the server even if you stop it. Do you want to proceed?");
      if (!confirmProceed) return;
    }

    const totalBudgetPercent = budgetProportions.reduce((sum, val) => sum + parseFloat(val || 0), 0);
    if (Math.abs(totalBudgetPercent - 100) > 0.01) {
      alert('Total Budget % must equal 100');
      return;
    }

    onSubmit({
      numCommercials,
      durations: durations.map(d => parseFloat(d)),
      budgetProportions: budgetProportions.map(b => parseFloat(b)),
      budget: parseFloat(budget),
      budgetBound: parseFloat(budgetBound),
      minSpots: parseInt(minSpots),
      maxSpots: parseInt(maxSpots),
      timeLimit: time
    });
  };

  // Calculate total percentage for color coding
  const totalPercentage = budgetProportions.reduce((sum, val) => sum + parseFloat(val || 0), 0);
  const percentageColor = Math.abs(totalPercentage - 100) < 0.01 ? '#38a169' : '#e53e3e';

  // New enhanced styles
  const enhancedStyles = {
    form: {
      padding: '32px',
      maxWidth: '1000px',
      margin: '0 auto',
      backgroundColor: '#d5e9f7',
      borderRadius: '12px',
      boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
    },
    title: {
      color: '#2d3748',
      fontSize: '24px',
      fontWeight: '600',
      marginBottom: '10px',
      paddingBottom: '16px',
      borderBottom: '1px solid #e2e8f0',
    },
    formGroup: {
      marginBottom: '16px',
      width: '100%',
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      color: '#4a5568',
      fontWeight: '500',
      fontSize: '14px',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      fontSize: '14px',
      color: '#4a5568',
      backgroundColor: 'white',
      boxSizing: 'border-box',
    },
    sectionContainer: {
      backgroundColor: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '20px',
      marginBottom: '24px',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#2d3748',
      marginBottom: '16px',
      paddingBottom: '8px',
      borderBottom: '2px solid #e2e8f0',
    },
    commercialCard: {
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    },
    commercialRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px',
    },
    totalHint: {
      backgroundColor: '#edf2f7',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      color: percentageColor,
      marginTop: '12px',
    },
    sideBySideContainer: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      marginBottom: '24px',
    },
    buttonRow: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px',
    },
    backButton: {
      padding: '12px 20px',
      backgroundColor: '#edf2f7',
      color: '#2d3748',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      flex: 1,
    },
    submitButton: {
      padding: '12px 20px',
      backgroundColor: '#4299e1',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      flex: 1,
    },
    numCommercialsInput: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '16px',
    },
    numCommercialsLabel: {
      fontWeight: '500',
      color: '#4a5568',
      minWidth: '180px',
    },
  };

          return (
            <form onSubmit={handleSubmit} style={enhancedStyles.form}>
              <h2 style={enhancedStyles.title}>Optimization Setup</h2>

              {/* Commercial Details */}
              <div style={enhancedStyles.sectionContainer}>
                <h3 style={enhancedStyles.sectionTitle}>Commercial Details</h3>

                {/* Number of Commercials inside the section */}
                <div style={enhancedStyles.numCommercialsInput}>
                  <span style={enhancedStyles.numCommercialsLabel}>Number of Commercials:</span>
                  <input
                    type="number"
                    value={numCommercials}
                    onChange={handleNumCommercialsChange}
                    min={1}
                    style={{ ...enhancedStyles.input, width: '80px' }}
                  />
                </div>

        <div>
          {durations.map((duration, idx) => (
            <div key={idx} style={enhancedStyles.commercialCard}>
              <h4 style={{ margin: '0 0 12px 0', color: '#2d3748' }}>Commercial {idx + 1}</h4>
              <div style={enhancedStyles.commercialRow}>
                <div style={enhancedStyles.formGroup}>
                  <label style={enhancedStyles.label}>Duration (seconds):</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={e => handleDurationChange(idx, e.target.value)}
                    required
                    style={enhancedStyles.input}
                  />
                </div>
                <div style={enhancedStyles.formGroup}>
                  <label style={enhancedStyles.label}>Budget %:</label>
                  <input
                    type="number"
                    value={budgetProportions[idx] || ''}
                    onChange={e => handleBudgetProportionChange(idx, e.target.value)}
                    required
                    style={enhancedStyles.input}
                  />
                </div>
              </div>
            </div>
          ))}
          <p style={enhancedStyles.totalHint}>
            Total must be 100% — Current Total: {totalPercentage.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Budget Settings */}
      <div style={enhancedStyles.sectionContainer}>
        <h3 style={enhancedStyles.sectionTitle}>Budget Settings</h3>
        <div style={enhancedStyles.sideBySideContainer}>
          <div style={enhancedStyles.formGroup}>
            <label style={enhancedStyles.label}>Total Budget (Rs.):</label>
            <input
              type="text"
              value={formatWithCommas(budget)}
              onChange={e => {
                const rawValue = removeCommas(e.target.value);

                // allow only numbers
                if (!/^\d*$/.test(rawValue)) return;

                setBudget(rawValue);
              }}
              required
              style={enhancedStyles.input}
            />

          </div>
          <div style={enhancedStyles.formGroup}>
            <label style={enhancedStyles.label}>± Budget Bound (Rs.):</label>
            <input
              type="number"
              value={budgetBound}
              onChange={e => setBudgetBound(e.target.value)}
              style={enhancedStyles.input}
            />
          </div>
        </div>
      </div>

      {/* Spot Limits and Optimization Settings side by side */}
      <div style={enhancedStyles.sideBySideContainer}>
        {/* Spot Limits */}
        <div style={enhancedStyles.sectionContainer}>
          <h3 style={enhancedStyles.sectionTitle}>Spot Limits</h3>
          <div style={enhancedStyles.formGroup}>
            <label style={enhancedStyles.label}>Minimum Spots per Program:</label>
            <input
              type="number"
              value={minSpots}
              onChange={e => setMinSpots(e.target.value)}
              style={enhancedStyles.input}
            />
          </div>
          <div style={enhancedStyles.formGroup}>
            <label style={enhancedStyles.label}>Maximum Spots per Program:</label>
            <input
              type="number"
              value={maxSpots}
              onChange={e => setMaxSpots(e.target.value)}
              style={enhancedStyles.input}
            />
          </div>
        </div>

        {/* Optimization Settings */}
        <div style={enhancedStyles.sectionContainer}>
          <h3 style={enhancedStyles.sectionTitle}>Optimization Settings</h3>
          <div style={enhancedStyles.formGroup}>
            <label style={enhancedStyles.label}>Time Limit (seconds):</label>
            <input
              type="number"
              value={timeLimit}
              onChange={e => setTimeLimit(e.target.value)}
              style={enhancedStyles.input}
              min={10}
            />
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={enhancedStyles.buttonRow}>
        <button type="button" onClick={onBack} style={enhancedStyles.backButton}>
          Go Back
        </button>
        <button type="submit" style={enhancedStyles.submitButton}>
          Review Program Table
        </button>
      </div>
    </form>
  );
}

export default OptimizationSetup;