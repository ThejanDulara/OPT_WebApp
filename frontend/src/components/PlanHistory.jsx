// src/components/PlanHistory.jsx
import React, { useEffect, useState, useMemo } from 'react';

const hostname = window.location.hostname;
const isLocal =
  hostname.includes("localhost") || hostname.includes("127.");

const API_BASE = isLocal
  ? "http://localhost:5000"
  : "https://optwebapp-production-60b4.up.railway.app";

function PlanHistory({ onBack, onLoadPlan }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const auth = (typeof window !== 'undefined' && window.__AUTH__) || {};
  const userId = auth.userId || "";
  const isAdmin = !!auth.isAdmin;

  const [showOnlyMine, setShowOnlyMine] = useState(false);

  useEffect(() => {
    async function fetchPlans() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (userId) params.append("user_id", userId);
        if (isAdmin) params.append("is_admin", "1");

        const res = await fetch(`${API_BASE}/plans?${params.toString()}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to fetch plans");
        }

        const rows = Array.isArray(json.plans) ? json.plans : [];
        setPlans(rows);
      } catch (e) {
        console.error("Error loading plans", e);
        setError(e.message || "Error loading plans");
      } finally {
        setLoading(false);
      }
    }

    if (userId) {
      fetchPlans();
    } else {
      setLoading(false);
    }
  }, [userId, isAdmin]);

  const visiblePlans = useMemo(() => {
    if (!isAdmin || !showOnlyMine) return plans;
    return plans.filter((p) => String(p.user_id) === String(userId));
  }, [plans, isAdmin, showOnlyMine, userId]);

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return "-";
    }
  };

    async function handleDeletePlan(id, ownerId) {
      if (!window.confirm("Are you sure you want to delete this plan?")) {
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/delete-plan/${id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            is_admin: isAdmin,
          }),
        });

        const json = await res.json();

        if (!json.success) {
          alert(json.error || "Failed to delete plan.");
          return;
        }

        setPlans((prev) => prev.filter((p) => p.id !== id));
      } catch (err) {
        alert("Error deleting plan.");
        console.error(err);
      }
    }


  return (
    <div style={styles.form}>
      <h2 style={styles.title}>Saved Plans History</h2>

      <div style={styles.headerRow}>
        <div style={styles.filterSection}>
          {isAdmin && (
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={showOnlyMine}
                onChange={(e) => setShowOnlyMine(e.target.checked)}
                style={styles.checkbox}
              />
              Show only my plans
            </label>
          )}
        </div>

        <div style={styles.recordCount}>
          Showing <strong>{visiblePlans.length}</strong> of {plans.length} plans
        </div>
      </div>

      {loading && (
        <div style={styles.loadingState}>
          <p>Loading plans...</p>
        </div>
      )}

      {error && (
        <div style={styles.errorState}>
          <p style={styles.errorText}>{error}</p>
        </div>
      )}

      {!loading && !error && visiblePlans.length === 0 && (
        <div style={styles.emptyState}>
          <p>No saved plans found.</p>
        </div>
      )}

      {!loading && !error && visiblePlans.length > 0 && (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Client</th>
                <th style={styles.tableHeader}>Brand</th>
                <th style={styles.tableHeader}>Activation Period</th>
                <th style={styles.tableHeader}>Campaign</th>
                <th style={styles.tableHeader}>Budget (LKR)</th>
                {isAdmin && <th style={styles.tableHeader}>User</th>}
                <th style={styles.tableHeader}>Created At</th>
                <th style={styles.tableHeader}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((p, index) => {
                const period = (p.activation_from && p.activation_to)
                  ? `${formatDate(p.activation_from)} → ${formatDate(p.activation_to)}`
                  : "-";
                const userName =
                  p.user_first_name || p.user_last_name
                    ? `${p.user_first_name || ""} ${p.user_last_name || ""}`.trim()
                    : "-";

                return (
                  <tr key={p.id} style={index % 2 === 0 ? styles.tableRow : { ...styles.tableRow, backgroundColor: '#f8fafc' }}>
                    <td style={styles.tableCell}>{p.client_name || "-"}</td>
                    <td style={styles.tableCell}>{p.brand_name || "-"}</td>
                    <td style={styles.tableCell}>{period}</td>
                    <td style={styles.tableCell}>{p.campaign || "-"}</td>
                    <td style={styles.rightAlignedCell}>
                      {p.total_budget != null
                        ? Number(p.total_budget).toLocaleString('en-LK', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "-"}
                    </td>
                    {isAdmin && <td style={styles.tableCell}>{userName}</td>}
                    <td style={styles.tableCell}>
                      {p.created_at ? new Date(p.created_at).toLocaleString() : "-"}
                    </td>
                    <td style={styles.centerAlignedCell}>
                      <button
                        style={styles.reuseButton}
                        onClick={() => onLoadPlan(p.id)}
                      >
                        Re-use Plan
                      </button>

                      {(isAdmin || String(p.user_id) === String(userId)) && (
                        <button
                          style={styles.deleteButton}
                          onClick={() => handleDeletePlan(p.id, p.user_id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.buttonGroup}>
        <button onClick={onBack} style={styles.backButton}>
          Back to Home
        </button>
      </div>
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
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  filterSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#4a5568',
    fontWeight: '500',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    marginRight: '8px',
    transform: 'scale(1.2)',
  },
  recordCount: {
    fontSize: '14px',
    color: '#718096',
    fontWeight: '500',
  },
  tableContainer: {
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    whiteSpace: 'nowrap',
  },
  tableHeader: {
    padding: '16px 12px',
    textAlign: 'left',
    backgroundColor: '#f7fafc',
    color: '#4a5568',
    fontWeight: '600',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  tableRow: {
    borderBottom: '1px solid #e2e8f0',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f8fafc',
    },
  },
  tableCell: {
    padding: '14px 12px',
    color: '#4a5568',
    borderBottom: '1px solid #edf2f7',
    fontSize: '14px',
  },
  rightAlignedCell: {
    padding: '14px 12px',
    color: '#4a5568',
    textAlign: 'right',
    borderBottom: '1px solid #edf2f7',
    fontSize: '14px',
    fontWeight: '500',
  },
  centerAlignedCell: {
    padding: '14px 12px',
    color: '#4a5568',
    textAlign: 'center',
    borderBottom: '1px solid #edf2f7',
    fontSize: '14px',
  },
  reuseButton: {
    padding: '8px 16px',
    backgroundColor: '#38a169',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    ':hover': {
      backgroundColor: '#2f855a',
      transform: 'translateY(-1px)',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
    },
  },
  loadingState: {
    textAlign: 'center',
    padding: '40px',
    color: '#718096',
    fontSize: '16px',
  },
  errorState: {
    textAlign: 'center',
    padding: '40px',
  },
  errorText: {
    color: '#e53e3e',
    fontSize: '16px',
    fontWeight: '500',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#718096',
    fontSize: '16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  buttonGroup: {
    marginTop: '24px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
    deleteButton: {
      marginLeft: "10px",
      padding: "8px 16px",
      backgroundColor: "#e53e3e",
      color: "white",
      border: "none",
      borderRadius: "6px",
      fontSize: "13px",
      cursor: "pointer",
      transition: "0.2s",
    },
  backButton: {
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

export default PlanHistory;