import React from 'react';

function FrontPage({ onStart, onManagePrograms, onOpenHistory, onOpenSummaries }) {
  return (
    <section style={pageWrapper}>
      {/* Left gradient panel with image */}
      <div style={leftPanel}>
        <div style={leftInner}>
          <img
            src="/TS-GARA-Mask.png"
            alt="TS GARA Mask"
            style={{
              height: 420,
              marginBottom: 40,
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.25))",
            }}
          />
          <h1 style={leftTitle}>Media Intelligence Platform</h1>
          <p style={leftText}>
             Where Courage Meets Clarity, The Lions of Media Leadership Powering Data-Driven Business Growth.
          </p>
        </div>
      </div>

      {/* Right content panel */}
      <div style={rightPanel}>
        <div style={contentBox}>
          {/* Logo at the very top */}
          <div style={logoContainer}>
            <img
              src="/company-logo.png"
              alt="MTM Group Logo"
              style={logoStyle}
              onError={(e) => {
                e.target.style.display = 'none';
                const fallback = document.getElementById('logo-fallback');
                if (fallback && fallback.style) {
                  fallback.style.display = 'block';
                }
              }}
            />
            <div id="logo-fallback" style={{ display: 'none', color: '#2d3748', fontWeight: 'bold', fontSize: '36px' }}>
              MTM
            </div>
          </div>

          <h1 style={companyName}>MTM Group</h1>
          <p style={tagline}>Where Intelligence Shapes Smarter Media Planning.</p>

          <button onClick={onStart} style={primaryButton}>
            Start Optimization
          </button>

          <button
            onClick={() => {
              if (
                !window.__AUTH__?.canUpdateData &&
                window.location.hostname !== "localhost"
              ) {
                alert(
                  "You do not have access to manage program data.\n\nPlease contact the administrators for verification."
                );
                return;
              }
              onManagePrograms();
            }}
            style={secondaryButton}
          >
            Manage Program Data
          </button>


          <button onClick={onOpenHistory} style={secondaryButton}>
            View Saved Plans
          </button>

          <button onClick={onOpenSummaries} style={secondaryButton}>
            View Plan Summaries
          </button>
        </div>
      </div>
    </section >
  );
}

/* ==================== STYLES ==================== */
const pageWrapper = {
  width: '100%',
  minHeight: '100vh',
  display: 'flex',
  flexWrap: 'wrap',
  overflowY: 'auto',
  background: '#fff',
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
};

/* Color palette based on #d5e9f7 */
const colors = {
  primary: '#d5e9f7',      // Base blue
  primaryDark: '#a8c9e3',  // Darker shade
  primaryLight: '#e8f2fc', // Lighter shade
  accent: '#4a90e2',       // Complementary blue
  accentDark: '#2c6cb0',   // Darker accent
  textDark: '#2d3748',     // Dark text
  textLight: '#4a5568',    // Light text
  background: '#f7fafc',   // Background
  white: '#ffffff',        // White
};

/* Left gradient panel */
const leftPanel = {
  flex: 1,
  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryLight} 100%)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 40px',
  color: colors.textDark,
};

const leftInner = { textAlign: 'center', maxWidth: 560 };
const leftTitle = {
  fontSize: 36,
  fontWeight: 700,
  marginBottom: 20,
  color: colors.accentDark,
  textShadow: '0 2px 4px rgba(0,0,0,0.1)'
};
const leftText = {
  fontSize: 19,
  lineHeight: 1.6,
  color: colors.textLight,
  opacity: 0.9
};

/* Right panel */
const rightPanel = {
  flex: 1,
  background: colors.background,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 20px',
};

const contentBox = {
  background: colors.white,
  padding: '50px 40px',
  borderRadius: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
  width: '100%',
  maxWidth: 480,
  border: `1px solid ${colors.primary}`,
  textAlign: 'center',
};

/* Logo */
const logoContainer = {
  marginBottom: '30',
  width: '80px',
  height: '80px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 40px',
};
const logoStyle = {
  maxWidth: '180%',
  maxHeight: '180%',
  objectFit: 'contain',
};

/* Text */
const companyName = {
  fontSize: '24px',
  fontWeight: '700',
  color: colors.textDark,
  marginBottom: '8px',
};
const tagline = {
  fontSize: '18px',
  color: colors.textLight,
  marginBottom: '44px',
  fontWeight: '500',
  lineHeight: '1.5',
  maxWidth: '380px',
  marginLeft: 'auto',
  marginRight: 'auto',
};

/* Buttons */
const primaryButton = {
  padding: '16px 40px',
  backgroundColor: colors.accent,
  color: 'white',
  border: 'none',
  borderRadius: '30px',
  fontSize: '17px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.25s ease',
  marginBottom: '16px',
  boxShadow: `0 4px 12px rgba(74,144,226,0.3)`,
  display: 'block',
  width: '100%',
  maxWidth: '280px',
  marginLeft: 'auto',
  marginRight: 'auto',
};

const secondaryButton = {
  padding: '14px 32px',
  background: colors.white,
  borderRadius: '30px',
  fontSize: '16px',
  fontWeight: '600',
  cursor: 'pointer',
  width: '100%',
  maxWidth: '260px',
  margin: '0 auto 18px',
  color: colors.accentDark,
  border: '2px solid transparent',
  backgroundImage: `linear-gradient(${colors.white}, ${colors.white}),
                    linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
  backgroundOrigin: 'border-box',
  backgroundClip: 'padding-box, border-box',
  transition: '0.3s',
};

// Add hover effects using CSS-in-JS
const addHoverEffects = () => {
  const style = document.createElement('style');
  style.textContent = `
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    }
    button:active {
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);
};

// Initialize hover effects
if (typeof document !== 'undefined') {
  addHoverEffects();
}

export default FrontPage;