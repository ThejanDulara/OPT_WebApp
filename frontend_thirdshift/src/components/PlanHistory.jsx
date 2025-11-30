// src/components/PlanHistory.jsx
import React, { useEffect, useState, useMemo } from 'react';

const hostname = window.location.hostname;
const isLocal =
  hostname.includes("localhost") || hostname.includes("127.");

const API_BASE = isLocal
  ? "http://localhost:5000"                        // Flask OPT API locally
  : "https://optwebapp-production.up.railway.app"; // Production OPT API

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
    return plans.filter((p) => p.user_id === userId);
  }, [plans, isAdmin, showOnlyMine, userId]);

  return (
    <section style={styles.wrapper}>
      <div style={styles.headerRow}>
        <h2 style={styles.title}>Saved Plans</h2>
        <div style={styles.headerRight}>
          {isAdmin && (
            <label style={styles.toggleLabel}>
              <input
                type="checkbox"
                checked={showOnlyMine}
                onChange={(e) => setShowOnlyMine(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Show only my plans
            </label>
          )}
          <button onClick={onBack} style={styles.backButton}>
            Back to Home
          </button>
        </div>
      </div>

      {loading && <p>Loading plans...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && visiblePlans.length === 0 && (
        <p>No saved plans found.</p>
      )}

      {!loading && !error && visiblePlans.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Client</th>
                <th style={styles.th}>Brand</th>
                <th style={styles.th}>Activation Period</th>
                <th style={styles.th}>Campaign</th>
                <th style={styles.th}>Budget</th>
                {isAdmin && <th style={styles.th}>User</th>}
                <th style={styles.th}>Created At</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((p) => {
                const period = (p.activation_from && p.activation_to)
                  ? `${p.activation_from} → ${p.activation_to}`
                  : "-";
                const userName =
                  p.user_first_name || p.user_last_name
                    ? `${p.user_first_name || ""} ${p.user_last_name || ""}`.trim()
                    : "-";

                return (
                  <tr key={p.id}>
                    <td style={styles.td}>{p.client_name || "-"}</td>
                    <td style={styles.td}>{p.brand_name || "-"}</td>
                    <td style={styles.td}>{period}</td>
                    <td style={styles.td}>{p.campaign || "-"}</td>
                    <td style={styles.td}>
                      {p.total_budget != null
                        ? Number(p.total_budget).toLocaleString('en-LK', {
                            maximumFractionDigits: 2,
                          })
                        : "-"}
                    </td>
                    {isAdmin && <td style={styles.td}>{userName}</td>}
                    <td style={styles.td}>
                      {p.created_at ? String(p.created_at).replace('T', ' ').slice(0, 19) : "-"}
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.reuseButton}
                        onClick={() => onLoadPlan(p.id)}
                      >
                        Re-use Plan
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const styles = {
  wrapper: {
    background: '#f7fafc',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: '#2d3748',
  },
  headerRight: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: '14px',
    color: '#4a5568',
  },
  backButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e0',
    background: '#fff',
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '13px',
    color: '#4a5568',
    background: '#edf2f7',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #edf2f7',
    fontSize: '13px',
    color: '#2d3748',
  },
  reuseButton: {
    padding: '4px 10px',
    borderRadius: '6px',
    border: 'none',
    background: '#3bb9af',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
};

export default PlanHistory;
