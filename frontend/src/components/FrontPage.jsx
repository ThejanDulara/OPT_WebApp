import React from 'react';

function FrontPage({ onStart, onManagePrograms }) {
  return (
    <div style={styles.container}>
      <div style={styles.backgroundBox}>
        <div style={styles.content}>
          {/* Logo at the very top */}
          <div style={styles.logoContainer}>
            <img
              src="/company-logo.png"
              alt="MTM Group Logo"
              style={styles.logo}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = document.getElementById('logo-fallback');
                if (fallback && fallback.style) {
                  fallback.style.display = 'block';
                }
              }}
            />
            <div id="logo-fallback" style={{ display: 'none', color: '#2d3748' }}>
              MTM
            </div>
          </div>

          <h1 style={styles.companyName}>MTM Group</h1>
          <p style={styles.tagline}>Where Intelligence Shapes Smarter Media Planning.</p>

          <button
            onClick={onStart}
            style={styles.startButton}
          >
            Start Optimization
          </button>

          <button
            onClick={onManagePrograms}
            style={styles.secondaryButton}
          >
            Manage Program Data
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#cae7fc',
    padding: '20px',
    textAlign: 'center',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
  },
  backgroundBox: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '60px 40px',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
    width: '100%',
    maxWidth: '500px'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  logoContainer: {
    marginBottom: '25px',
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logo: {
    maxWidth: '180%',
    maxHeight: '180%',
    objectFit: 'contain'
  },
  companyName: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '5px',
    marginTop: '20px'
  },
  tagline: {
    fontSize: '18px',
    color: '#4a5568',
    marginBottom: '40px',
    fontWeight: '500',
    lineHeight: '1.5',
    maxWidth: '350px'
  },
  startButton: {
    padding: '14px 36px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '30px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: '12px'
  },
  secondaryButton: {
    padding: '12px 28px',
    backgroundColor: '#edf2f7',
    color: '#2d3748',
    border: '1px solid #cbd5e0',
    borderRadius: '30px',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }
};

export default FrontPage;
