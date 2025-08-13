import React, { useState } from 'react';

function OptimizationSetup({ onSubmit, onBack, initialValues }) {
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
        const confirmProceed = window.confirm("⚠️ You’ve set the time limit over 10 minutes.\n\nThe optimization will keep running on the server even if you stop it. Do you want to proceed?");
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


  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.title}>🎯 Optimization Setup</h2>

      <div style={styles.formGroup}>
        <label style={styles.label}>Number of Commercials:</label>
        <input
          type="number"
          value={numCommercials}
          onChange={handleNumCommercialsChange}
          min={1}
          style={styles.input}
        />
      </div>

      <div style={styles.commercialsContainer}>
        {durations.map((duration, idx) => (
          <div key={idx} style={styles.commercialRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Duration for Commercial {idx + 1} (seconds):</label>
              <input
                type="number"
                value={duration}
                onChange={e => handleDurationChange(idx, e.target.value)}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Budget % for Commercial {idx + 1}:</label>
              <input
                type="number"
                value={budgetProportions[idx] || ''}
                onChange={e => handleBudgetProportionChange(idx, e.target.value)}
                required
                style={styles.input}
              />
            </div>
          </div>
        ))}
        <p style={{ color: '#4a5568', marginTop: '8px', fontSize: '14px' }}>
          🎯 Total must be 100% — Current Total: {budgetProportions.reduce((sum, val) => sum + parseFloat(val || 0), 0)}%
        </p>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Total Budget (Rs.):</label>
        <input
          type="number"
          value={budget}
          onChange={e => setBudget(e.target.value)}
          required
          style={styles.input}
        />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>± Budget Bound (Rs.):</label>
        <input
          type="number"
          value={budgetBound}
          onChange={e => setBudgetBound(e.target.value)}
          style={styles.input}
        />
      </div>

      <div style={styles.spotsContainer}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Minimum Spots per Program:</label>
          <input
            type="number"
            value={minSpots}
            onChange={e => setMinSpots(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Maximum Spots per Program:</label>
          <input
            type="number"
            value={maxSpots}
            onChange={e => setMaxSpots(e.target.value)}
            style={styles.input}
          />
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>⏱ Optimization Time Limit (seconds):</label>
        <input
          type="number"
          value={timeLimit}
          onChange={e => setTimeLimit(e.target.value)}
          style={styles.input}
          min={10}
        />
      </div>

      <button type="button" onClick={onBack} style={styles.backButton}>
        ← Go Back to Program Selection
      </button>

      <button type="submit" style={styles.submitButton}>
        Next → Review Program Table
      </button>
    </form>
  );
}

const styles = {
  form: {
    padding: '32px',
    maxWidth: '800px',
    margin: '0 auto',
    backgroundColor: '#d5e9f7',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
  },
  title: {
    color: '#2d3748',
    fontSize: '24px',
    fontWeight: '600',
    marginBottom: '32px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
  },
  formGroup: {
    marginBottom: '24px',
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
    padding: '12px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#4a5568',
    backgroundColor: 'white',
  },
  commercialsContainer: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  commercialRow: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  spotsContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '24px',
  },
  backButton: {
    marginBottom: '16px',
    padding: '10px 20px',
    backgroundColor: '#edf2f7',
    color: '#2d3748',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
  },
  submitButton: {
    width: '100%',
    padding: '12px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};

export default OptimizationSetup;
