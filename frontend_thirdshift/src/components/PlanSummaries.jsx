import React, { useEffect, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const hostname = window.location.hostname;
const isLocal = hostname.includes("localhost") || hostname.includes("127.");
const API_BASE = isLocal ? "http://localhost:5000" : "https://optwebapp-production.up.railway.app";

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
            // Sequentially delete to modify state safely or parallel
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

        const data = summaries.map(row => {
            const rowData = {
                ID: row.id,
                'Client': row.client,
                'Brand': row.brand,
                'Activation Period': row.activation_period,
                'Medium': row.medium,
                'Channel': row.channel,
                'Budget': row.budget,
                'Created At': new Date(row.created_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })
            };

            // If admin, add user info
            if (isAdmin) {
                rowData['User ID'] = row.user_id;
                rowData['User Name'] = `${row.user_first_name || ''} ${row.user_last_name || ''}`.trim();
            }

            return rowData;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Plan Summaries");

        // Generate buffer
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });

        saveAs(blob, `Plan_Summaries_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div style={s.container}>
            <div style={s.header}>
                <button onClick={onBack} style={s.backButton}>&larr; Back to Home</button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <h2 style={s.title}>Saved Plan Summaries</h2>
                </div>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: 20 }}>Loading summaries...</div>}
            {error && <div style={{ color: 'red', textAlign: 'center', padding: 20 }}>{error}</div>}

            <div style={s.grid}>
                {!loading && groupedSummaries.map(group => (
                    <SummaryCard
                        key={group.key}
                        group={group}
                        onDelete={() => handleDeleteGroup(group.rows)}
                        onUpdate={handleUpdate}
                    />
                ))}
                {!loading && groupedSummaries.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No saved plan summaries found.</div>
                )}
            </div>

            {!loading && summaries.length > 0 && (
                <div style={s.footer}>
                    <button onClick={handleExport} style={s.btnExport}>Export to Excel</button>
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
        // Update all rows in group
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

    return (
        <div style={s.card}>
            <div style={s.cardHeader}>
                {isEditing ? (
                    <div style={s.editHeaderForm}>
                        <div style={s.formGroup}>
                            <label style={s.label}>Client</label>
                            <input value={editData.client} onChange={e => setEditData({ ...editData, client: e.target.value })} style={s.input} />
                        </div>
                        <div style={s.formGroup}>
                            <label style={s.label}>Brand</label>
                            <input value={editData.brand} onChange={e => setEditData({ ...editData, brand: e.target.value })} style={s.input} />
                        </div>
                        <div style={s.formGroup}>
                            <label style={s.label}>Activation Period</label>
                            <input value={editData.activation_period} onChange={e => setEditData({ ...editData, activation_period: e.target.value })} style={s.input} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                            <button onClick={saveHeader} style={s.btnSave}>Save Changes</button>
                            <button onClick={() => setIsEditing(false)} style={s.btnCancel}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={s.cardTitle}>{group.client}</h3>
                                <h4 style={s.cardSubtitle}>{group.brand}</h4>
                            </div>
                            <div style={s.actions}>
                                <button onClick={() => setIsEditing(true)} style={s.btnEdit}>Edit Header</button>
                                <button onClick={onDelete} style={s.btnDelete}>Delete</button>
                            </div>
                        </div>

                        <div style={s.cardMeta}>
                            <div style={s.metaItem}><strong>Period:</strong> {group.activation_period}</div>
                            <div style={s.metaItem}><strong>Created by:</strong> {group.user_first_name} {group.user_last_name}</div>
                            <div style={s.metaItem}><strong>Date:</strong> {new Date(group.created_at).toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })}</div>
                            <div style={s.metaItem}><strong>Medium:</strong> {group.medium}</div>
                        </div>
                    </div>
                )}
            </div>

            <div style={s.tableWrapper}>
                <table style={s.table}>
                    <thead>
                        <tr>
                            <th style={s.th}>Channel</th>
                            <th style={s.thRight}>Total Budget (LKR)</th>
                            <th style={s.thCenter}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.rows.map(row => (
                            <RowItem key={row.id} row={row} onUpdate={onUpdate} />
                        ))}
                        <tr style={s.totalRow}>
                            <td style={s.td}><strong>Total</strong></td>
                            <td style={s.tdRight}><strong>{totalBudget.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function RowItem({ row, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [data, setData] = useState({ channel: row.channel, budget: row.budget });

    const handleSave = async () => {
        await onUpdate(row, { ...row, channel: data.channel, budget: data.budget });
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <tr>
                <td style={s.td}>
                    <input value={data.channel} onChange={e => setData({ ...data, channel: e.target.value })} style={s.inputSm} />
                </td>
                <td style={s.tdRight}>
                    <input value={data.budget} onChange={e => setData({ ...data, budget: e.target.value })} style={s.inputSmRight} />
                </td>
                <td style={s.tdCenter}>
                    <button onClick={handleSave} style={s.btnSaveSm}>Save</button>
                    <button onClick={() => setIsEditing(false)} style={s.btnCancelSm}>Cancel</button>
                </td>
            </tr>
        );
    }
    return (
        <tr>
            <td style={s.td}>{row.channel}</td>
            <td style={s.tdRight}>{Number(row.budget).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
            <td style={s.tdCenter}><button onClick={() => setIsEditing(true)} style={s.btnEditSm}>Edit</button></td>
        </tr>
    );
}

const s = {
    container: {
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '40px 20px',
        fontFamily: "'Segoe UI', Roboto, sans-serif",
        paddingBottom: '100px'
    },
    header: {
        marginBottom: '30px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
    },
    backButton: {
        padding: '10px 20px',
        backgroundColor: '#edf2f7',
        border: '1px solid #cbd5e0',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '600',
        color: '#4a5568'
    },
    title: {
        fontSize: '28px',
        color: '#2d3748',
        margin: 0
    },
    grid: {
        display: 'grid',
        gap: '30px'
    },
    card: {
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
    },
    cardHeader: {
        padding: '20px 24px',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc'
    },
    cardTitle: {
        margin: '0 0 5px 0',
        fontSize: '20px',
        color: '#2d3748'
    },
    cardSubtitle: {
        margin: 0,
        fontSize: '18px',
        color: '#4a5568',
        fontWeight: 'normal'
    },
    cardMeta: {
        marginTop: '15px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '20px',
        fontSize: '14px',
        color: '#718096'
    },
    metaItem: {
        background: '#edf2f7',
        padding: '4px 10px',
        borderRadius: '20px'
    },
    actions: {
        display: 'flex',
        gap: '10px'
    },
    tableWrapper: {
        padding: '0'
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '15px'
    },
    th: {
        textAlign: 'left',
        padding: '12px 24px',
        backgroundColor: '#f1f5f9',
        color: '#475569',
        fontWeight: '600',
        borderBottom: '1px solid #e2e8f0'
    },
    thRight: {
        textAlign: 'right',
        padding: '12px 24px',
        backgroundColor: '#f1f5f9',
        color: '#475569',
        fontWeight: '600',
        borderBottom: '1px solid #e2e8f0'
    },
    thCenter: {
        textAlign: 'center',
        padding: '12px 24px',
        backgroundColor: '#f1f5f9',
        color: '#475569',
        fontWeight: '600',
        borderBottom: '1px solid #e2e8f0',
        width: '120px'
    },
    td: {
        padding: '12px 24px',
        borderBottom: '1px solid #e2e8f0',
        color: '#334155'
    },
    tdRight: {
        padding: '12px 24px',
        borderBottom: '1px solid #e2e8f0',
        color: '#334155',
        textAlign: 'right'
    },
    tdCenter: {
        padding: '12px 24px',
        borderBottom: '1px solid #e2e8f0',
        textAlign: 'center'
    },
    totalRow: {
        backgroundColor: '#f8fafc'
    },
    btnEdit: {
        fontSize: '13px',
        padding: '6px 12px',
        borderRadius: '4px',
        border: '1px solid #4299e1',
        color: '#4299e1',
        background: 'white',
        cursor: 'pointer'
    },
    btnDelete: {
        fontSize: '13px',
        padding: '6px 12px',
        borderRadius: '4px',
        border: '1px solid #e53e3e',
        color: '#e53e3e',
        background: 'white',
        cursor: 'pointer'
    },
    btnSave: {
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        color: 'white',
        background: '#38a169',
        cursor: 'pointer'
    },
    btnCancel: {
        padding: '8px 16px',
        borderRadius: '4px',
        border: '1px solid #a0aec0',
        color: '#4a5568',
        background: 'white',
        cursor: 'pointer'
    },
    btnEditSm: {
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid #cbd5e0',
        background: 'white',
        cursor: 'pointer',
        color: '#4a5568'
    },
    btnSaveSm: {
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: 'none',
        background: '#38a169',
        color: 'white',
        cursor: 'pointer',
        marginRight: '5px'
    },
    btnCancelSm: {
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid #cbd5e0',
        background: 'white',
        cursor: 'pointer'
    },
    input: {
        width: '100%',
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid #cbd5e0',
        marginBottom: '10px'
    },
    inputSm: {
        width: '100%',
        padding: '4px',
        borderRadius: '3px',
        border: '1px solid #cbd5e0'
    },
    inputSmRight: {
        width: '100%',
        padding: '4px',
        borderRadius: '3px',
        border: '1px solid #cbd5e0',
        textAlign: 'right'
    },
    formGroup: {
        marginBottom: '10px'
    },
    label: {
        display: 'block',
        fontSize: '12px',
        color: '#4a5568',
        fontWeight: '600',
        marginBottom: '4px'
    },
    footer: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        padding: '20px',
        background: 'white',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'center',
        boxShadow: '0 -4px 6px rgba(0,0,0,0.05)',
        zIndex: 10
    },
    btnExport: {
        padding: '12px 24px',
        backgroundColor: '#2b6cb0',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontWeight: '600',
        fontSize: '16px',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }
};
