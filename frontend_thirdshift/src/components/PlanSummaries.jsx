import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const hostname = window.location.hostname;
const isLocal = hostname.includes("localhost") || hostname.includes("127.");
const API_BASE = isLocal ? "http://localhost:5000" : "https://optwebapp-production.up.railway.app";

// Helper function to convert UTC to Sri Lanka time (GMT+5:30)
const toSriLankaTime = (utcDateString) => {
    if (!utcDateString) return '';

    const date = new Date(utcDateString);
    // Sri Lanka is UTC+5:30
    const sriLankaTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));

    return sriLankaTime.toLocaleString('en-LK', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
};

export default function PlanSummaries({ onBack }) {
    const [summaries, setSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const auth = (typeof window !== 'undefined' && window.__AUTH__) ? window.__AUTH__ : {};
    const userId = auth.userId || auth.user_id || 1;
    const isAdmin = auth.role === 'admin' || isLocal;

    const fetchSummaries = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/plan-summaries?user_id=${userId}&is_admin=${isAdmin}`);
            const json = await res.json();
            if (json.success) {
                setSummaries(json.summaries);
            } else {
                setError(json.error || 'Failed to fetch summaries');
            }
        } catch (err) {
            setError('Error fetching summaries');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummaries();
    }, [userId, isAdmin]);

    const groupedSummaries = useMemo(() => {
        if (!summaries.length) return [];

        const groups = {};

        summaries.forEach(row => {
            // Group by distinct plan identifying fields
            const key = `${row.created_at}|${row.client}|${row.brand}|${row.activation_period}|${row.user_id}`;
            if (!groups[key]) {
                groups[key] = {
                    key,
                    created_at: row.created_at,
                    client: row.client,
                    brand: row.brand,
                    activation_period: row.activation_period,
                    user_first_name: row.user_first_name,
                    user_last_name: row.user_last_name,
                    user_id: row.user_id,
                    medium: row.medium,
                    rows: []
                };
            }
            groups[key].rows.push(row);
        });

        return Object.values(groups).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [summaries]);

    const handleDeleteGroup = async (groupRows) => {
        if (!window.confirm("Are you sure you want to delete this plan summary?")) return;

        try {
            await Promise.all(groupRows.map(r =>
                fetch(`${API_BASE}/plan-summaries/${r.id}`, { method: 'DELETE' })
            ));
            fetchSummaries();
        } catch (e) {
            alert("Error deleting records");
        }
    };

    const handleUpdate = async (row, newVal) => {
        try {
            const res = await fetch(`${API_BASE}/plan-summaries/${row.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newVal)
            });
            const json = await res.json();
            if (json.success) {
                fetchSummaries();
            } else {
                alert(json.error);
            }
        } catch (e) {
            alert("Error updating");
        }
    };

    const handleExport = () => {
        if (!summaries.length) return;

        // Sort summaries by created_at (descending) and then by id (descending)
        const sortedSummaries = [...summaries].sort((a, b) => {
            // First sort by created_at (newest first)
            const dateA = new Date(a.created_at);
            const dateB = new Date(b.created_at);
            if (dateA > dateB) return -1;
            if (dateA < dateB) return 1;
            // If same date, sort by id descending
            return (b.id || 0) - (a.id || 0);
        });

        const data = sortedSummaries.map(row => {
            const rowData = {
                ID: row.id,
                'Client': row.client,
                'Brand': row.brand,
                'Activation Period': row.activation_period,
                'Medium': row.medium,
                'Channel': row.channel,
                'Budget (LKR)': Number(row.budget || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 }),
                'Created At (Sri Lanka Time)': toSriLankaTime(row.created_at)
            };

            // Always add user info
            rowData['User ID'] = row.user_id;
            rowData['User Name'] = `${row.user_first_name || ''} ${row.user_last_name || ''}`.trim();

            return rowData;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Plan Summaries");

        // Auto-size columns
        const maxWidth = 50;
        const wscols = [
            { wch: 10 }, // ID
            { wch: 20 }, // Client
            { wch: 20 }, // Brand
            { wch: 25 }, // Activation Period
            { wch: 15 }, // Medium
            { wch: 20 }, // Channel
            { wch: 18 }, // Budget
            { wch: 25 }, // Created At
            { wch: 12 }, // User ID
            { wch: 25 }, // User Name
        ];
        worksheet['!cols'] = wscols;

        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

        saveAs(blob, `Plan_Summaries_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>Saved Plan Summaries</h2>
            </div>

            <div style={styles.controls}>
                <button onClick={onBack} style={styles.backButton}>
                    Back to Home
                </button>
                <button onClick={handleExport} style={styles.exportButton}>
                    Export to Excel
                </button>
            </div>

            {loading && (
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner}></div>
                    <p style={styles.loadingText}>Loading summaries...</p>
                </div>
            )}

            {error && (
                <div style={styles.errorContainer}>
                    <p style={styles.errorText}>{error}</p>
                </div>
            )}

            <div style={styles.grid}>
                {!loading && groupedSummaries.map(group => (
                    <SummaryCard
                        key={group.key}
                        group={group}
                        onDelete={() => handleDeleteGroup(group.rows)}
                        onUpdate={handleUpdate}
                    />
                ))}
                {!loading && groupedSummaries.length === 0 && (
                    <div style={styles.emptyContainer}>
                        <p style={styles.emptyText}>No saved plan summaries found.</p>
                    </div>
                )}
            </div>

            {!loading && summaries.length > 0 && (
                <div style={{ marginTop: '20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
                    {summaries.length} rows loaded covering {groupedSummaries.length} plans.
                </div>
            )}
        </div>
    );
}

function SummaryCard({ group, onDelete, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState({
        client: group.client,
        brand: group.brand,
        activation_period: group.activation_period
    });

    const saveHeader = async () => {
        for (const row of group.rows) {
            await onUpdate(row, {
                ...row,
                client: editData.client,
                brand: editData.brand,
                activation_period: editData.activation_period
            });
        }
        setIsEditing(false);
    };

    const totalBudget = group.rows.reduce((a, r) => a + Number(r.budget || 0), 0);

    // Sort rows by id descending within the group
    const sortedRows = useMemo(() => {
        return [...group.rows].sort((a, b) => (b.id || 0) - (a.id || 0));
    }, [group.rows]);

    return (
        <div style={styles.card}>
            <div style={styles.cardHeader}>
                {isEditing ? (
                    <div style={styles.editHeaderForm}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Client</label>
                            <input
                                value={editData.client}
                                onChange={e => setEditData({ ...editData, client: e.target.value })}
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Brand</label>
                            <input
                                value={editData.brand}
                                onChange={e => setEditData({ ...editData, brand: e.target.value })}
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Activation Period</label>
                            <input
                                value={editData.activation_period}
                                onChange={e => setEditData({ ...editData, activation_period: e.target.value })}
                                style={styles.input}
                            />
                        </div>
                        <div style={styles.editHeaderActions}>
                            <button onClick={saveHeader} style={styles.saveButton}>
                                Save Changes
                            </button>
                            <button onClick={() => setIsEditing(false)} style={styles.cancelButton}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={styles.cardHeaderTop}>
                            <div>
                                <h3 style={styles.cardTitle}><span style={styles.labelMuted}>Client:</span> {group.client}</h3>
                                <h4 style={styles.cardSubtitle}><span style={styles.labelMuted}>Brand:</span> {group.brand}</h4>
                            </div>
                            <div style={styles.cardActions}>
                                <button onClick={() => setIsEditing(true)} style={styles.editButton}>
                                    ✏️ Edit Header
                                </button>
                                <button onClick={onDelete} style={styles.deleteButton}>
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>

                        <div style={styles.cardMeta}>
                            <div style={styles.metaItem}>
                                <strong>Period:</strong> {group.activation_period}
                            </div>
                            <div style={styles.metaItem}>
                                <strong>Created by:</strong> {group.user_first_name} {group.user_last_name}
                            </div>
                            <div style={styles.metaItem}>
                                <strong>Date:</strong> {toSriLankaTime(group.created_at)}
                            </div>
                            <div style={styles.metaItem}>
                                <strong>Medium:</strong> {group.medium}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div style={styles.tableWrapper}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.tableHeader}>#</th>
                            <th style={styles.tableHeader}>Channel</th>
                            <th style={{ ...styles.tableHeader, textAlign: 'right' }}>Total Budget (LKR)</th>
                            <th style={{ ...styles.tableHeader, textAlign: 'center', width: '120px' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map((row, idx) => (
                            <RowItem
                                key={row.id}
                                row={row}
                                index={idx + 1}
                                onUpdate={onUpdate}
                            />
                        ))}
                        <tr style={styles.totalRow}>
                            <td style={styles.tableCell} colSpan={2}>
                                <strong>Total</strong>
                            </td>
                            <td style={{ ...styles.tableCell, textAlign: 'right' }}>
                                <strong>{totalBudget.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong>
                            </td>
                            <td style={styles.tableCell}></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function RowItem({ row, index, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [data, setData] = useState({ channel: row.channel, budget: row.budget });

    const handleSave = async () => {
        await onUpdate(row, { ...row, channel: data.channel, budget: data.budget });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <tr style={styles.tableRow}>
                <td style={{ ...styles.tableCell, textAlign: 'center' }}>{index}</td>
                <td style={styles.tableCell}>
                    <input
                        value={data.channel}
                        onChange={e => setData({ ...data, channel: e.target.value })}
                        style={styles.inputCell}
                    />
                </td>
                <td style={{ ...styles.tableCell, textAlign: 'right' }}>
                    <input
                        type="number"
                        value={data.budget}
                        onChange={e => setData({ ...data, budget: e.target.value })}
                        style={{ ...styles.inputCell, textAlign: 'right' }}
                    />
                </td>
                <td style={{ ...styles.tableCell, textAlign: 'center' }}>
                    <button onClick={handleSave} style={styles.saveSmallButton}>
                        Save
                    </button>
                    <button onClick={() => setIsEditing(false)} style={styles.cancelSmallButton}>
                        Cancel
                    </button>
                </td>
            </tr>
        );
    }

    return (
        <tr style={styles.tableRow}>
            <td style={{ ...styles.tableCell, textAlign: 'center' }}><strong>{index}</strong></td>
            <td style={styles.tableCell}>{row.channel}</td>
            <td style={{ ...styles.tableCell, textAlign: 'right' }}>
                {Number(row.budget).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
            </td>
            <td style={{ ...styles.tableCell, textAlign: 'center' }}>
                <button onClick={() => setIsEditing(true)} style={styles.editSmallButton}>
                    ✏️ Edit
                </button>
            </td>
        </tr>
    );
}

const styles = {
    container: {
        padding: '32px',
        maxWidth: '1200px',
        margin: '0 auto',
        backgroundColor: '#d5e9f7',
        borderRadius: '12px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
        minHeight: '100vh',
        fontFamily: "'Segoe UI', Roboto, sans-serif",
    },
    header: {
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid #cbd5e0',
    },
    controls: {
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
    },
    title: {
        color: '#2d3748',
        fontSize: '24px',
        fontWeight: '600',
        margin: 0,
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
    loadingContainer: {
        textAlign: 'center',
        padding: '40px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
    },
    loadingSpinner: {
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #4299e1',
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 20px',
    },
    loadingText: {
        color: '#4a5568',
        fontSize: '16px',
    },
    errorContainer: {
        backgroundColor: '#fff5f5',
        border: '1px solid #fc8181',
        color: '#c53030',
        padding: '16px',
        borderRadius: '8px',
        textAlign: 'center',
        marginBottom: '20px',
    },
    errorText: {
        margin: 0,
        fontSize: '14px',
    },
    emptyContainer: {
        textAlign: 'center',
        padding: '60px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
    },
    emptyText: {
        color: '#718096',
        fontSize: '16px',
        margin: 0,
    },
    grid: {
        display: 'grid',
        gap: '24px',
    },
    card: {
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
    },
    cardHeader: {
        padding: '24px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
    },
    cardHeaderTop: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '16px',
    },
    cardTitle: {
        margin: '0 0 5px 0',
        fontSize: '20px',
        color: '#1a202c',
        fontWeight: '600',
    },
    cardSubtitle: {
        margin: 0,
        fontSize: '16px',
        color: '#4a5568',
        fontWeight: '500',
    },
    cardActions: {
        display: 'flex',
        gap: '8px',
    },
    editButton: {
        padding: '8px 14px',
        backgroundColor: '#edf2f7',
        color: '#4a5568',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ':hover': {
            backgroundColor: '#e2e8f0',
        },
    },
    deleteButton: {
        padding: '8px 14px',
        backgroundColor: '#EF4444',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ':hover': {
            backgroundColor: '#dc2626',
        },
    },
    cardMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
    },
    metaItem: {
        backgroundColor: '#edf2f7',
        padding: '6px 12px',
        borderRadius: '20px',
        fontSize: '13px',
        color: '#4a5568',
    },
    editHeaderForm: {
        padding: '8px 0',
    },
    formGroup: {
        marginBottom: '16px',
    },
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: '600',
        color: '#4a5568',
        marginBottom: '6px',
    },
    input: {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #e2e8f0',
        fontSize: '14px',
        ':focus': {
            outline: 'none',
            borderColor: '#4299e1',
        },
    },
    editHeaderActions: {
        display: 'flex',
        gap: '10px',
        marginTop: '8px',
    },
    saveButton: {
        padding: '8px 16px',
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
    cancelButton: {
        padding: '8px 16px',
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
    tableWrapper: {
        width: '100%',
        overflowX: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px',
        whiteSpace: 'nowrap',
    },
    tableHeader: {
        padding: '12px 16px',
        textAlign: 'left',
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
        padding: '6px 8px',
        border: '1px solid #e2e8f0',
        borderRadius: '4px',
        fontSize: '13px',
        ':focus': {
            outline: 'none',
            borderColor: '#4299e1',
        },
    },
    totalRow: {
        backgroundColor: '#f8fafc',
        fontWeight: '600',
    },
    saveSmallButton: {
        padding: '4px 10px',
        backgroundColor: '#4299e1',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        marginRight: '6px',
        ':hover': {
            backgroundColor: '#3182ce',
        },
    },
    cancelSmallButton: {
        padding: '4px 10px',
        backgroundColor: '#edf2f7',
        color: '#4a5568',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        ':hover': {
            backgroundColor: '#e2e8f0',
        },
    },
    editSmallButton: {
        padding: '4px 10px',
        backgroundColor: '#edf2f7',
        color: '#4a5568',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        cursor: 'pointer',
        ':hover': {
            backgroundColor: '#e2e8f0',
        },
    },
    footer: {
        marginTop: '32px',
        display: 'flex',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
    },
    exportButton: {
        padding: '10px 20px',
        backgroundColor: '#38a169',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        ':hover': {
            backgroundColor: '#2f855a',
        },
    },
    labelMuted: {
        color: '#718096',
        fontWeight: 'normal',
        fontSize: '0.9em',
        marginRight: '6px'
    }
};

// Add keyframe animation for spinner
const styleSheet = document.createElement("style");
styleSheet.textContent = `
            @keyframes spin {
                0 % { transform: rotate(0deg); }
        100% {transform: rotate(360deg); }
    }
            `;
document.head.appendChild(styleSheet);