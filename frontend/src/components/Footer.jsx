// components/Footer.jsx
import React from 'react';

function Footer() {
  return (
    <footer style={styles.footer}>
      <p>© {new Date().getFullYear()} MTM Group. All rights reserved.</p>
    </footer>
  );
}

const styles = {
  footer: {
    marginTop: '40px',
    padding: '12px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#718096',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f9fafc'
  }
};

export default Footer;
