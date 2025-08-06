import React, { useEffect, useState } from 'react';

function ProgramUpdater({ onBack }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('Derana');
  const [programs, setPrograms] = useState([]);
  const [newChannelName, setNewChannelName] = useState('');
  const [isAddingChannel, setIsAddingChannel] = useState(false);

  useEffect(() => {
    fetch('/api/channels')
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels || []);
        if (data.channels.includes('Derana')) {
          fetch(`/api/programs/Derana`)
            .then(res => res.json())
            .then(data => setPrograms(data.programs || []));
        }
      });
  }, []);

  const handleChannelSelect = (e) => {
    const channel = e.target.value;
    setSelectedChannel(channel);
    fetch(`/api/programs/${channel}`)
      .then(res => res.json())
      .then(data => setPrograms(data.programs || []));
  };

  const handleProgramChange = (index, field, value) => {
    const updated = [...programs];
    updated[index][field] = value;
    setPrograms(updated);
  };

  const addNewProgram = () => {
    setPrograms([...programs, { day: '', time: '', program: '', cost: 0, tvr: 0, slot: '' }]);
  };

  const deleteProgram = (program, slot) => {
    if (!window.confirm(`Are you sure you want to delete "${program}" from slot "${slot}"?`)) return;

    fetch('/api/delete-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selectedChannel, program, slot })
    })
      .then(res => res.json())
      .then(() => {
        setPrograms(programs.filter(p => !(p.program === program && p.slot === slot)));
        alert('🗑️ Program deleted.');
      })
      .catch(() => alert('❌ Delete failed.'));
  };

  const saveChanges = () => {
    fetch('/api/update-programs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selectedChannel, programs })
    })
      .then(res => res.json())
      .then(data => alert('✅ Programs updated successfully!'))
      .catch(() => alert('❌ Failed to update programs.'));
  };

  const createChannel = () => {
    if (!newChannelName) return;
    fetch('/api/create-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newChannelName })
    })
      .then(res => res.json())
      .then(() => {
        setChannels([...channels, newChannelName]);
        setSelectedChannel(newChannelName);
        setNewChannelName('');
        setIsAddingChannel(false);
        setPrograms([]);
      });
  };

  const getLogoPath = (channel) => `/logos/${channel}.png`;

  return (
    <div style={styles.form}>
      <h2 style={styles.title}>📺 Program Manager</h2>

      <div style={styles.channelSelector}>
        <label style={styles.label}>Select Channel:</label>
        <select
          value={selectedChannel}
          onChange={handleChannelSelect}
          style={styles.select}
        >
          <option value="">-- Select --</option>
          {channels.map((c, i) => (
            <option key={i} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={() => setIsAddingChannel(true)}
          style={styles.addButton}
        >
          ➕ Add New Channel
        </button>
      </div>

      {isAddingChannel && (
        <div style={styles.addChannelContainer}>
          <input
            type="text"
            placeholder="New Channel Name"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            style={styles.input}
          />
          <button onClick={createChannel} style={styles.createButton}>
            Create
          </button>
        </div>
      )}

      {selectedChannel && (
        <div style={styles.channelCard}>
          <div style={styles.channelHeader}>
            <div style={styles.channelInfo}>
              <img
                src={getLogoPath(selectedChannel)}
                alt={selectedChannel}
                style={styles.channelLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <h3 style={styles.channelName}>Programs for {selectedChannel}</h3>
            </div>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeader}>Day</th>
                  <th style={styles.tableHeader}>Time</th>
                  <th style={styles.tableHeader}>Program</th>
                  <th style={styles.tableHeader}>Rate (30 Sec)</th>
                  <th style={styles.tableHeader}>TVR (30 Sec)</th>
                  <th style={styles.tableHeader}>Slot (PT[A]/NPT[B])</th>
                  <th style={styles.tableHeader}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.tableCell}>
                      <input
                        type="text"
                        value={p.day || ''}
                        onChange={(e) => handleProgramChange(idx, 'day', e.target.value)}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.tableCell}>
                      <input
                        type="text"
                        value={p.time || ''}
                        onChange={(e) => handleProgramChange(idx, 'time', e.target.value)}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.tableCell}>
                      <input
                        type="text"
                        value={p.program}
                        onChange={(e) => handleProgramChange(idx, 'program', e.target.value)}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.rightAlignedCell}>
                      <input
                        type="number"
                        value={p.cost}
                        onChange={(e) => handleProgramChange(idx, 'cost', parseFloat(e.target.value))}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.rightAlignedCell}>
                      <input
                        type="number"
                        value={p.tvr}
                        onChange={(e) => handleProgramChange(idx, 'tvr', parseFloat(e.target.value))}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.centerAlignedCell}>
                      <input
                        type="text"
                        value={p.slot}
                        onChange={(e) => handleProgramChange(idx, 'slot', e.target.value)}
                        style={styles.inputCell}
                      />
                    </td>
                    <td style={styles.centerAlignedCell}>
                      <button
                        style={styles.deleteButton}
                        onClick={() => deleteProgram(p.program, p.slot)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={styles.buttonGroup}>
            <button onClick={addNewProgram} style={styles.secondaryButton}>
              ➕ Add Program
            </button>
            <button onClick={saveChanges} style={styles.primaryButton}>
              💾 Save Changes
            </button>
          </div>
        </div>
      )}

      <button onClick={onBack} style={styles.backButton}>
        ← Back to Home
      </button>
    </div>
  );
}

const styles = {
  form: {
    padding: '32px',
    maxWidth: '1400px',
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
  channelSelector: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  label: {
    color: '#4a5568',
    fontWeight: '500',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    backgroundColor: 'white',
    fontSize: '14px',
    minWidth: '200px',
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
  addChannelContainer: {
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
    fontSize: '14px',
    minWidth: '200px',
  },
  createButton: {
    padding: '8px 16px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#3182ce',
    },
  },
  channelCard: {
    marginBottom: '32px',
    border: '1px solid #e2e8f0',
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  channelHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px',
  },
  channelInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  channelLogo: {
    height: '70px',
    width: 'auto',
    objectFit: 'contain',
    borderRadius: '4px',
  },
  channelName: {
    margin: 0,
    color: '#1a202c',
    fontSize: '25px',
    fontWeight: '600',
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '16px',
  },
  tableHeader: {
    padding: '12px 16px',
    textAlign: 'center',
    backgroundColor: '#f7fafc',
    color: '#4a5568',
    fontWeight: '600',
    borderBottom: '1px solid #e2e8f0',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    ':hover': {
      backgroundColor: '#f8fafc',
    },
  },
  tableCell: {
    padding: '12px 16px',
    color: '#4a5568',
  },
  inputCell: {
    width: '100%',
    padding: '8px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    fontSize: '14px',
    ':focus': {
      outline: 'none',
      borderColor: '#4299e1',
    },
  },
  rightAlignedCell: {
    padding: '12px 16px',
    color: '#4a5568',
    textAlign: 'right',
  },
  centerAlignedCell: {
    padding: '12px 16px',
    color: '#4a5568',
    textAlign: 'center',
  },
    deleteButton: {
      padding: '8px 14px',
      backgroundColor: '#EF4444', // Tailwind red-500
      color: '#fff',
      border: '1px solid transparent',
      borderRadius: '0.3rem', // rounded-xl
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.3s ease-in-out',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',

      // Use a library like Emotion or CSS-in-JS with nested syntax
      ':hover': {
        backgroundColor: '#DC2626', // Tailwind red-600
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transform: 'translateY(-1px)',
      },

      ':active': {
        transform: 'scale(0.98)',
        backgroundColor: '#B91C1C', // Tailwind red-700
      },
  },
  buttonGroup: {
    marginTop: '24px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '10px 20px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#3182ce',
    },
  },
  secondaryButton: {
    padding: '10px 20px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
  backButton: {
    marginTop: '24px',
    padding: '10px 20px',
    backgroundColor: '#edf2f7',
    color: '#4a5568',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#e2e8f0',
    },
  },
};

export default ProgramUpdater;