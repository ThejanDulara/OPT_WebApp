import React, { useState, useEffect } from 'react';

function ProgramSelector({ onSubmit }) {
  const [programsByChannel, setProgramsByChannel] = useState({});
  const [selectedPrograms, setSelectedPrograms] = useState({});

  useEffect(() => {
    fetch('https://optwebapp-production.up.railway.app/all-programs')
      .then(res => res.json())
      .then(data => {
        const grouped = {};
        data.programs.forEach(p => {
          if (!grouped[p.channel]) grouped[p.channel] = [];
          grouped[p.channel].push(p);
        });
        setProgramsByChannel(grouped);
      });
  }, []);

  const handleCheckboxChange = (programId) => {
    setSelectedPrograms(prev => ({
      ...prev,
      [programId]: !prev[programId]
    }));
  };

  const handleSelectAll = (channel) => {
    const updated = { ...selectedPrograms };
    programsByChannel[channel].forEach(p => {
      updated[p.id] = true;
    });
    setSelectedPrograms(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const selectedIds = Object.keys(selectedPrograms).filter(id => selectedPrograms[id]);
    onSubmit(selectedIds.map(id => parseInt(id)));
  };

  const getLogoPath = (channel) => `/logos/${channel}.png`;

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.title}>Select Programs from Channels</h2>

      {Object.entries(programsByChannel).map(([channel, programs]) => (
        <div key={channel} style={styles.channelCard}>
          <div style={styles.channelHeader}>
            <div style={styles.channelInfo}>
              <img
                src={getLogoPath(channel)}
                alt={channel}
                style={styles.channelLogo}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <h3 style={styles.channelName}>{channel}</h3>
            </div>
            <button
              type="button"
              onClick={() => handleSelectAll(channel)}
              style={styles.selectAllButton}
            >
              Select All
            </button>
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Select</th>
                    <th style={styles.tableHeader}>Day</th>
                    <th style={styles.tableHeader}>Time</th>
                    <th style={styles.tableHeader}>Program</th>
                    <th style={styles.tableHeader}>Cost</th>
                    <th style={styles.tableHeader}>TVR</th>
                    <th style={styles.tableHeader}>Slot</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map(p => (
                    <tr key={p.id} style={selectedPrograms[p.id] ? styles.selectedRow : styles.tableRow}>
                      <td style={styles.tableCell}>
                        <input
                          type="checkbox"
                          checked={!!selectedPrograms[p.id]}
                          onChange={() => handleCheckboxChange(p.id)}
                          style={styles.checkbox}
                        />
                      </td>
                      <td style={styles.tableCell}>{p.day}</td>
                      <td style={styles.tableCell}>{p.time}</td>
                      <td style={styles.tableCell}>{p.program}</td>
                      <td style={styles.rightAlignedCell}>{p.cost !== null && p.cost !== undefined ? Number(p.cost).toFixed(2) : '-'}</td>
                      <td style={styles.rightAlignedCell}>{p.tvr}</td>
                      <td style={styles.centerAlignedCell}>{p.slot}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      ))}

      <button type="submit" style={styles.submitButton}>
       Go to Optimization Setup
      </button>
    </form>
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
  channelCard: {
    marginBottom: '32px',
    border: '1px solid #e2e8f0',
    padding: '24px',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
    transition: 'box-shadow 0.2s ease',
    ':hover': {
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
    },
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
  selectAllButton: {
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
  selectedRow: {
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f0f9ff',
  },
  tableCell: {
    padding: '12px 16px',
    color: '#4a5568',
  },
  checkbox: {
    accentColor: '#4299e1',
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },

  submitButton: {
    marginTop: '24px',
    padding: '12px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#3182ce',
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
};

export default ProgramSelector;