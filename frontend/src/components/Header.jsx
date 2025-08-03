import React from 'react';

function Header() {
  return (
    <header style={styles.header}>
      {/* Left: Tagline */}
      <div style={styles.left}>
        <span style={styles.tagline}>Where Intelligence Shapes Smarter Media Planning.</span>
      </div>

      {/* Center: Logo + Company Name */}
      <div style={styles.center}>
        <img src="/company-logo.png" alt="MTM Logo" style={styles.logo} />
        <h1 style={styles.title}>MTM Group</h1>
      </div>

      {/* Right: App context */}
      <div style={styles.right}>
        <span style={styles.environment}>📺 Television Media Scheduling Optimization Tool </span>
        <span style={styles.year}>2025</span>
      </div>
    </header>
  );
}

const styles = {
  header: {
    backgroundColor: '#f7fafc',
    padding: '12px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #e2e8f0',
    flexWrap: 'wrap',
    position: 'relative',
  },
  left: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
  },
  center: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  right: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '16px',
    fontSize: '14px',
    color: '#4a5568',
  },
  logo: {
    height: '40px',
    width: 'auto',
    objectFit: 'contain',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2d3748',
    margin: 0,
  },
  tagline: {
    fontSize: '14px',
    color: '#4a5568',
    fontStyle: 'italic',
  },
  environment: {
    backgroundColor: '#edf2f7',
    padding: '6px 12px',
    borderRadius: '20px',
    fontWeight: '500',
  },
  year: {
    fontWeight: '500',
  }
};

export default Header;
