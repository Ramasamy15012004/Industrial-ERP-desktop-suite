import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageWrapper from '../../components/ui/PageWrapper';
import TableContainer from '../../components/ui/TableContainer';
import { getUserRole, getAuthToken } from '../../api/auth';

const API = 'http://localhost:8000';

const MATERIAL_REPORT_META = {
    label: 'Material Consumption',
    desc: 'Fixture-wise material issued report from material transaction history.',
};

const ACTIVITY_REPORT_META = {
    label: 'Recent Activity',
    desc: 'User activity log for the selected date range.',
};

const fmt = (n) =>
    n == null ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const fmtDate = (d) => {
    if (!d) return '-';
    const parts = String(d).split('-');
    if (parts.length !== 3) return String(d);
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const fmtDateTime = (value) => {
    if (!value) return '-';
    const [datePart, timePart] = String(value).split(' ');
    const formattedDate = fmtDate(datePart || value);
    return timePart ? `${formattedDate} ${timePart}` : formattedDate;
};

function FiltersBar({ filters, setFilters, fixtureOptions, onGenerate, loading }) {
    return (
        <div className="rpt-filters">
            <div className="form-field" style={{ minWidth: 160 }}>
                <label className="form-label">From Date</label>
                <input
                    type="date"
                    className="form-control"
                    value={filters.from_date}
                    onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value }))}
                />
            </div>
            <div className="form-field" style={{ minWidth: 160 }}>
                <label className="form-label">To Date</label>
                <input
                    type="date"
                    className="form-control"
                    value={filters.to_date}
                    onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value }))}
                />
            </div>
            <div className="form-field" style={{ minWidth: 220 }}>
                <label className="form-label">Fixture</label>
                <select
                    className="form-control"
                    value={filters.fixture_name}
                    onChange={(e) => setFilters((f) => ({ ...f, fixture_name: e.target.value }))}
                >
                    <option value="">All Issued Fixtures</option>
                    {fixtureOptions.map((fixture) => (
                        <option key={fixture} value={fixture}>
                            {fixture}
                        </option>
                    ))}
                </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button className="btn btn-primary" onClick={onGenerate} disabled={loading} style={{ minWidth: 140 }}>
                    {loading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>
        </div>
    );
}

function KpiStrip({ items }) {
    return (
        <div className="rpt-kpi-strip">
            {items.map((k) => (
                <div key={k.label} className="rpt-kpi">
                    <div className="rpt-kpi__value">{k.value}</div>
                    <div className="rpt-kpi__label">{k.label}</div>
                </div>
            ))}
        </div>
    );
}

function MaterialConsumptionReport({ data }) {
    if (!data || data.length === 0) {
        return (
            <p className="text-secondary" style={{ textAlign: 'center', padding: 24 }}>
                No fixture material issue data found for the selected period.
            </p>
        );
    }

    const totalIssued = data.reduce((sum, row) => sum + (row.issued_qty || 0), 0);
    const fixtureCount = new Set(data.map((row) => String(row.fixture_name || '').trim()).filter(Boolean)).size;
    const uniquePartCount = new Set(
        data.map((row) => `${row.part_name || ''}||${row.article_number || ''}||${row.make || ''}`)
    ).size;
    const makeCount = new Set(data.map((row) => String(row.make || '').trim()).filter(Boolean)).size;

    return (
        <>
            <KpiStrip
                items={[
                    { label: 'Fixtures', value: fixtureCount },
                    { label: 'Issued Lines', value: data.length },
                    { label: 'Unique Parts', value: uniquePartCount },
                    { label: 'Makes', value: makeCount },
                    { label: 'Total Issued Qty', value: fmt(totalIssued) },
                ]}
            />
            <div className="table-container table-container-fill">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Issue Time</th>
                            <th>Fixture</th>
                            <th>BO No</th>
                            <th>Part Name</th>
                            <th>Article Number</th>
                            <th>Make</th>
                            <th>Issued Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={`${row.issue_time}-${row.fixture_name}-${row.article_number}-${i}`}>
                                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(row.issue_time)}</td>
                                <td style={{ fontWeight: 700 }}>{row.fixture_name || '-'}</td>
                                <td style={{ fontFamily: 'monospace' }}>{row.bo_no || '-'}</td>
                                <td style={{ fontWeight: 600 }}>{row.part_name || '-'}</td>
                                <td style={{ fontFamily: 'monospace' }}>{row.article_number || '-'}</td>
                                <td>{row.make || '-'}</td>
                                <td style={{ color: 'var(--status-completed-fg)', fontWeight: 700 }}>
                                    {fmt(row.issued_qty)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function RecentActivityPanel({
    filters,
    setFilters,
    activities,
    loading,
    error,
    onGenerate,
}) {
    return (
        <>
            <div className="rpt-filters">
                <div className="form-field" style={{ minWidth: 160 }}>
                    <label className="form-label">From Date</label>
                    <input
                        type="date"
                        className="form-control"
                        value={filters.from_date}
                        onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value }))}
                    />
                </div>
                <div className="form-field" style={{ minWidth: 160 }}>
                    <label className="form-label">To Date</label>
                    <input
                        type="date"
                        className="form-control"
                        value={filters.to_date}
                        onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value }))}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <button className="btn btn-primary" onClick={onGenerate} disabled={loading} style={{ minWidth: 140 }}>
                        {loading ? 'Loading...' : 'View Activity'}
                    </button>
                </div>
            </div>

            {error ? (
                <p className="text-danger" style={{ fontWeight: 700 }}>
                    Error: {error}
                </p>
            ) : null}

            <TableContainer className="table-container-fill">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Activity</th>
                            <th>Details</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="table-empty">Loading activity...</td>
                            </tr>
                        ) : activities.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="table-empty">No activity yet.</td>
                            </tr>
                        ) : (
                            activities.map((activity) => (
                                <tr key={activity.id}>
                                    <td>{activity.full_name || activity.username}</td>
                                    <td>{activity.role}</td>
                                    <td>{activity.activity_type}</td>
                                    <td>{activity.details || '-'}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(activity.performed_at)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </TableContainer>
        </>
    );
}

const Reports = () => {
    const role = getUserRole();
    const isAdmin = role === 'admin';
    const allowed = role === 'admin' || role === 'production' || role === 'inventory' || role === 'audit';

    const today = new Date().toISOString().split('T')[0];
    const monthStart = `${today.substring(0, 7)}-01`;

    const [filters, setFilters] = useState({ from_date: monthStart, to_date: today, fixture_name: '' });
    const [fixtureOptions, setFixtureOptions] = useState([]);
    const [activeReport, setActiveReport] = useState('material_consumption');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [reportData, setReportData] = useState(null);
    const [generated, setGenerated] = useState(false);
    const [activityFilters, setActivityFilters] = useState({ from_date: monthStart, to_date: today });
    const [activities, setActivities] = useState([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [activityError, setActivityError] = useState(null);
    const [activityGenerated, setActivityGenerated] = useState(false);

    useEffect(() => {
        const fetchFixtureOptions = async () => {
            try {
                const res = await fetch(`${API}/reports/material-consumption/fixtures`, {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });
                if (!res.ok) throw new Error(`Server error: ${res.status}`);
                const json = await res.json();
                setFixtureOptions(Array.isArray(json) ? json : []);
            } catch (e) {
                console.error('Failed to load fixture options', e);
            }
        };

        fetchFixtureOptions();
    }, []);

    const fetchActivities = useCallback(async (filtersToUse = activityFilters) => {
        if (!isAdmin) {
            setActivities([]);
            setLoadingActivities(false);
            setActivityError(null);
            return;
        }

        setLoadingActivities(true);
        setActivityError(null);
        setActivityGenerated(true);

        try {
            const params = new URLSearchParams();
            if (filtersToUse.from_date) params.set('from_date', filtersToUse.from_date);
            if (filtersToUse.to_date) params.set('to_date', filtersToUse.to_date);

            const query = params.toString();
            const res = await fetch(`${API}/user-activity${query ? `?${query}` : ''}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const json = await res.json();
            setActivities(Array.isArray(json) ? json : []);
        } catch (e) {
            console.error('Failed to load recent activity', e);
            setActivities([]);
            setActivityError(e.message || 'Failed to load recent activity');
        } finally {
            setLoadingActivities(false);
        }
    }, [activityFilters, isAdmin]);

    const buildQuery = useCallback((base) => {
        const params = new URLSearchParams();
        if (filters.from_date) params.set('from_date', filters.from_date);
        if (filters.to_date) params.set('to_date', filters.to_date);
        if (filters.fixture_name) params.set('fixture_name', filters.fixture_name);
        return `${API}${base}?${params}`;
    }, [filters]);

    const generate = useCallback(async () => {
        if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
            alert('Selection Error: From Date cannot be after To Date.');
            return;
        }

        setLoading(true);
        setError(null);
        setReportData(null);
        setGenerated(false);

        try {
            const res = await fetch(buildQuery('/reports/material-consumption'), {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const json = await res.json();
            setReportData(json);
            setGenerated(true);
        } catch (e) {
            setError(e.message || 'Failed to generate report');
        } finally {
            setLoading(false);
        }
    }, [buildQuery, filters]);

    const downloadPDF = async () => {
        if (filters.from_date && filters.to_date && filters.from_date > filters.to_date) {
            alert('Selection Error: From Date cannot be after To Date.');
            return;
        }

        try {
            const res = await fetch(buildQuery('/reports/material-consumption/pdf'), {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch (e) {
            setError(e.message || 'Failed to download PDF');
        }
    };

    const handleSelectReport = useCallback((reportKey) => {
        setActiveReport(reportKey);

        if (
            reportKey === 'recent_activity'
            && isAdmin
            && !activityGenerated
            && !loadingActivities
        ) {
            fetchActivities(activityFilters);
        }
    }, [activityFilters, activityGenerated, fetchActivities, isAdmin, loadingActivities]);

    if (!allowed) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <PageWrapper
            title="Reports"
            subtitle="Choose a report and load the data you need."
            actions={
                activeReport === 'material_consumption' && generated && (
                    <button className="btn btn-secondary" onClick={downloadPDF}>
                        Download PDF
                    </button>
                )
            }
        >
            <div className="module-page scroll-auto">
                <div className="content-container" style={{ flex: 'none' }}>
                    <div className="section-head">
                        <h3 className="section-title small">Report Type</h3>
                    </div>
                    <div className="rpt-switcher">
                        <button
                            type="button"
                            className={`tab-btn${activeReport === 'material_consumption' ? ' active' : ''}`}
                            onClick={() => handleSelectReport('material_consumption')}
                        >
                            {MATERIAL_REPORT_META.label}
                        </button>
                        {isAdmin ? (
                            <button
                                type="button"
                                className={`tab-btn${activeReport === 'recent_activity' ? ' active' : ''}`}
                                onClick={() => handleSelectReport('recent_activity')}
                            >
                                {ACTIVITY_REPORT_META.label}
                            </button>
                        ) : null}
                    </div>
                </div>

                {activeReport === 'material_consumption' ? (
                    <div className="content-container" id="rpt-printable-area">
                        <div className="section-head">
                            <h3 className="section-title small">{MATERIAL_REPORT_META.label}</h3>
                            {generated && reportData ? (
                                <span className="text-muted" style={{ fontSize: 12 }}>
                                    {filters.from_date && filters.to_date
                                        ? `${fmtDate(filters.from_date)} to ${fmtDate(filters.to_date)}`
                                        : 'All time'}
                                </span>
                            ) : null}
                        </div>
                        <p className="text-secondary" style={{ marginTop: 4 }}>
                            {MATERIAL_REPORT_META.desc}
                        </p>
                        <FiltersBar
                            filters={filters}
                            setFilters={setFilters}
                            fixtureOptions={fixtureOptions}
                            onGenerate={generate}
                            loading={loading}
                        />

                        {error ? (
                            <p className="text-danger" style={{ fontWeight: 700 }}>Error: {error}</p>
                        ) : null}

                        {generated && reportData ? (
                            <>
                                {filters.fixture_name ? (
                                    <div className="text-secondary" style={{ fontWeight: 700, marginTop: -4 }}>
                                        Fixture: {filters.fixture_name}
                                    </div>
                                ) : null}

                                <MaterialConsumptionReport data={reportData} />
                            </>
                        ) : (
                            <p className="text-secondary rpt-empty-state">
                                Generate the report to view fixture-wise material issue data.
                            </p>
                        )}
                    </div>
                ) : null}

                {isAdmin && activeReport === 'recent_activity' ? (
                    <div className="content-container">
                        <div className="section-head">
                            <h3 className="section-title small">{ACTIVITY_REPORT_META.label}</h3>
                        </div>
                        <p className="text-secondary" style={{ marginTop: 4 }}>
                            {ACTIVITY_REPORT_META.desc}
                        </p>
                        <RecentActivityPanel
                            filters={activityFilters}
                            setFilters={setActivityFilters}
                            activities={activities}
                            loading={loadingActivities}
                            error={activityError}
                            onGenerate={fetchActivities}
                        />
                    </div>
                ) : null}
            </div>

            <style>{`
                .rpt-filters { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
                .rpt-switcher { display: flex; gap: 12px; flex-wrap: wrap; }
                .rpt-empty-state {
                    text-align: center;
                    padding: 24px;
                    border: 1px dashed var(--border-color);
                    border-radius: var(--radius-md);
                    background: var(--surface-2);
                    font-weight: 600;
                }

                .rpt-kpi-strip { display: flex; gap: 12px; flex-wrap: wrap; flex-shrink: 0; margin-bottom: 4px; }
                .rpt-kpi {
                    background: var(--surface-2);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    padding: 10px 20px;
                    min-width: 110px;
                    display: flex; flex-direction: column; gap: 2px;
                }
                .rpt-kpi__value { font-size: var(--text-xl); font-weight: 900; letter-spacing: -0.02em; color: var(--primary-700); }
                .rpt-kpi__label { font-size: var(--text-xs); color: var(--text-secondary); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
            `}</style>
        </PageWrapper>
    );
};

export default Reports;
