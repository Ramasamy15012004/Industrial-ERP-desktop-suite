import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { HelpCircle, X, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Card from "../../components/ui/Card";
import StatusBadge from "../../components/ui/StatusBadge";
import TableContainer from "../../components/ui/TableContainer";
import SecondaryButton from "../../components/ui/SecondaryButton";

const API = "http://localhost:8000/dashboard";
const CHART_API = "http://localhost:8000/fixture-issue-chart";

const CHART_COLORS = [
  "#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#14b8a6", "#e11d48", "#6366f1",
];

const toDateStr = (d) => d.toISOString().slice(0, 10);
const addDays = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};
const defaultStartDate = () => addDays(toDateStr(new Date()), -6);

const normalizeKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const StockTransactions = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fixtureDetails, setFixtureDetails] = useState(null);
  const [fixtureModalOpen, setFixtureModalOpen] = useState(false);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureChartData, setFixtureChartData] = useState([]);
  const [chartStartDate, setChartStartDate] = useState(defaultStartDate);

  // Pivot raw rows → { date, [fixtureName]: total_qty_issued, [fixtureName+"__bom"]: total_bom_qty, ... }
  // Filtered to 7-day window: [chartStartDate, chartStartDate + 6]
  const { pivotedData, allFixtures } = useMemo(() => {
    if (!fixtureChartData.length) return { pivotedData: [], allFixtures: [] };
    const endDate = addDays(chartStartDate, 6);
    const filtered = fixtureChartData.filter(
      (d) => d.issue_date >= chartStartDate && d.issue_date <= endDate
    );
    const fixtures = [...new Set(filtered.map((d) => d.fixture_name))];
    const byDate = {};
    filtered.forEach((d) => {
      if (!byDate[d.issue_date]) byDate[d.issue_date] = { date: d.issue_date };
      byDate[d.issue_date][d.fixture_name] = d.total_qty_issued;
      byDate[d.issue_date][`${d.fixture_name}__bom`] = d.total_bom_qty;
    });
    const sorted = Object.values(byDate).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    return { pivotedData: sorted, allFixtures: fixtures };
  }, [fixtureChartData, chartStartDate]);

  const fetchDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(API);
      setData(res.data);
    } catch (err) {
      console.error("Error fetching dashboard:", err);
      setError("Failed to load inventory dashboard");
    } finally {
      setLoading(false);
    }
  };

  const fetchFixtureChart = async () => {
    try {
      const res = await axios.get(CHART_API);
      setFixtureChartData(res.data);
    } catch (err) {
      console.error("Error fetching fixture chart:", err);
    }
  };

  useEffect(() => {
    fetchDashboard();
    fetchFixtureChart();
  }, []);

  const stockMovementTimeline = data?.stock_movement_timeline ?? [];
  const stockMovementTable = data?.stock_movement_table ?? [];
  const criticalMaterials = data?.critical_materials ?? [];
  const jobShortages = data?.job_shortages ?? [];
  const shortageItems = fixtureDetails?.materials?.filter(
    (item) => Number(item.shortage_qty || 0) > 0
  ) ?? [];


  const transactionTypeClass = (value) => {
    const key = normalizeKey(value);
    return ["txn-type", key ? `txn-type--${key}` : ""].filter(Boolean).join(" ");
  };

  const handleFixtureClick = async (productDetails) => {
    if (!productDetails) return;
    setFixtureLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/fixture-bom/details/${encodeURIComponent(productDetails)}`);
      setFixtureDetails(res.data);
      setFixtureModalOpen(true);
    } catch (err) {
      console.error("Error fetching fixture details:", err);
      setError("Failed to load fixture details");
    } finally {
      setFixtureLoading(false);
    }
  };

  const FixtureChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: "8px", padding: "10px 14px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.10)", fontSize: "12px", minWidth: "180px",
      }}>
        <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#374151" }}>{label}</p>
        {payload.map((entry) => (
          <div key={entry.dataKey} style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: entry.fill, display: "inline-block" }} />
              <span style={{ fontWeight: 600, color: "#1f2937" }}>{entry.dataKey}</span>
            </div>
            <div style={{ paddingLeft: "16px", color: "#6b7280" }}>
              <div>Total BOM Materials: <span style={{ fontWeight: 600, color: "#374151" }}>{entry.payload[`${entry.dataKey}__bom`] ?? "—"}</span></div>
              <div>Total Issued Qty: <span style={{ fontWeight: 600, color: "#374151" }}>{entry.value}</span></div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const HelpButton = ({ sectionId, tooltip }) => (
    <button
      onClick={() => navigate(`/help#${sectionId}`)}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#94a3b8', // slate-400
        padding: '2px',
        borderRadius: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        marginLeft: '8px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = '#3b82f6'; // blue-500
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = '#94a3b8'; // slate-400
      }}
      title={tooltip}
    >
      <HelpCircle size={14} />
    </button>
  );

  return (
    <div className="module-page scroll-auto">
      <div className="section-head">
        <h3 className="section-title">Inventory Dashboard</h3>
        {loading && <span className="text-secondary">Loading...</span>}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="inventory-dashboard-grid">
        <Card className="panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h3 className="panel-title" style={{ margin: 0 }}>Fixture Issue Chart</h3>
              <HelpButton
                sectionId="inventory-stock-timeline"
                tooltip="Shows total qty issued per fixture grouped by date. Hover a bar to see BOM materials count and issued qty."
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {chartStartDate} → {addDays(chartStartDate, 6)}
              </span>
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <Calendar size={16} style={{ color: 'var(--text-secondary)', pointerEvents: 'none', position: 'absolute', left: '8px', zIndex: 1 }} />
                <input
                  type="date"
                  value={chartStartDate}
                  onChange={(e) => e.target.value && setChartStartDate(e.target.value)}
                  style={{
                    paddingLeft: '28px', paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px',
                    border: '1px solid var(--border-color)', borderRadius: '6px',
                    fontSize: '12px', color: 'var(--text-primary)',
                    background: 'var(--bg-surface, #fff)', cursor: 'pointer',
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                />
              </label>
            </div>
          </div>
          <div className="inventory-dashboard-chart" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pivotedData}
                margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: "var(--text-secondary)" }}
                  allowDecimals={false}
                  label={{ value: "Qty Issued", angle: -90, position: "insideLeft", offset: 10, style: { fill: "var(--text-secondary)", fontSize: 11 } }}
                />
                <Tooltip content={<FixtureChartTooltip />} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12, paddingBottom: 6 }} />
                {allFixtures.map((fixture, idx) => (
                  <Bar
                    key={fixture}
                    dataKey={fixture}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={32}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="panel">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '16px'
          }}>
            <h3 className="panel-title" style={{ margin: 0 }}>Latest Transactions</h3>
            <HelpButton 
              sectionId="inventory-latest-transactions" 
              tooltip="This table shows the most recent stock movements in the system (typically the last 20 transactions).
."
            />
          </div>

          <TableContainer className="table-container-xs">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fixture</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      Loading transactions...
                    </td>
                  </tr>
                ) : stockMovementTable.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No transactions.
                    </td>
                  </tr>
                ) : (
                  stockMovementTable.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.product_details}</td>
                      <td>{row.fixture_qty}</td>
                      <td className={transactionTypeClass(row.status)}>
                        {row.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableContainer>
        </Card>
      </div>

      <div className="inventory-dashboard-grid equal">
        <Card className="panel">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '16px'
          }}>
            <h3 className="panel-title" style={{ margin: 0 }}>Critical Materials</h3>
            <HelpButton 
              sectionId="inventory-critical-materials" 
              tooltip=" This section shows materials that have fallen below their defined minimum stock level. It acts as an early warning system for inventory shortages."
            />
          </div>

          <TableContainer className="table-container-sm">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Min</th>
                  <th>Current</th>
                  <th>Below Min</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      Loading materials...
                    </td>
                  </tr>
                ) : criticalMaterials.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No critical materials.
                    </td>
                  </tr>
                ) : (
                  criticalMaterials.map((mat) => (
                    <tr key={mat.material_code}>
                      <td className="fw-800">{mat.material_name || mat.material_code}</td>
                      <td>{mat.minimum_stock}</td>
                      <td className="text-danger fw-800">{mat.current_stock}</td>
                      <td className="text-success fw-800">
                        {mat.below_minimum_by}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableContainer>
        </Card>

        <Card className="panel">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '16px'
          }}>
            <h3 className="panel-title" style={{ margin: 0 }}>Jobs At Risk</h3>
            <HelpButton 
              sectionId="inventory-jobs-at-risk" 
              tooltip=" This section identifies active production jobs that may stop or face delays due to material shortages.."
            />
          </div>

          <TableContainer className="table-container-sm">
            <table>
              <thead>
                <tr>
                  <th>Fixture</th>
                  <th>Qty</th>
                  <th>Status</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      Loading fixtures...
                    </td>
                  </tr>
                ) : jobShortages.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No partially reserved fixtures.
                    </td>
                  </tr>
                ) : (
                  jobShortages.map((job) => (
                    <tr
                      key={job.product_details}
                      onClick={() => handleFixtureClick(job.product_details)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="fw-800">{job.product_details}</td>
                      <td>{job.fixture_qty}</td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="text-danger fw-800">{job.shortage_qty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableContainer>
        </Card>
      </div>

      {fixtureModalOpen && fixtureDetails && (
        <div className="blur-overlay" style={styles.modalOverlay} onClick={() => setFixtureModalOpen(false)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h4 style={{ margin: 0, fontSize: "16px", color: "#374151" }}>{fixtureDetails.product_details}</h4>
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
                  Fixture Qty: {fixtureDetails.fixture_qty} | Status: {fixtureDetails.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFixtureModalOpen(false)}
                style={styles.closeButton}
              >
                <X size={16} />
              </button>
            </div>

            <TableContainer className="table-container-sm">
              <table>
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>Article No</th>
                    <th>Make</th>
                    <th>Required Qty</th>
                    <th>Shortage Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtureLoading ? (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        Loading fixture details...
                      </td>
                    </tr>
                  ) : shortageItems.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        No shortage materials found for this fixture.
                      </td>
                    </tr>
                  ) : (
                    shortageItems.map((item, index) => (
                        <tr key={`${item.bo_part_name}-${item.article_number}-${index}`}>
                          <td>{item.bo_part_name}</td>
                          <td>{item.article_number}</td>
                          <td>{item.make}</td>
                          <td>{item.required_qty}</td>
                          <td className="text-danger fw-800">{item.shortage_qty}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </TableContainer>

            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
              <SecondaryButton type="button" onClick={() => setFixtureModalOpen(false)}>
                Close
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    zIndex: 1000,
  },
  modalCard: {
    width: "min(960px, 100%)",
    maxHeight: "85vh",
    overflow: "auto",
    background: "#fff",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.24)",
  },
  modalHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
  },
  closeButton: {
    border: "none",
    background: "#f3f4f6",
    color: "#374151",
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
};

export default StockTransactions;
