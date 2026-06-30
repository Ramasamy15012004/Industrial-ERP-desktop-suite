import React, { useEffect, useState } from "react";
import axios from "axios";
import { Activity, Clock, Package, Hourglass } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

import Card from "../../components/ui/Card";
import ContentContainer from "../../components/ui/ContentContainer";
import PageWrapper from "../../components/ui/PageWrapper";

const DashboardCard = ({ title, value, icon, color }) => (
  <Card className="kpi-card centered">
    <div className={`kpi-icon toned-${color}`}>{icon}</div>

    <div className="kpi-title">{title}</div>

    <div className="kpi-value">{value}</div>
  </Card>
);

const MAKE_BAR_COLORS = {
  active: "#0f766e",
  zero: "#cbd5e1",
};

const formatMakeTick = (value) => {
  const make = String(value || "").trim();
  if (make.length <= 6) return make;
  return `${make.slice(0, 6)}...`;
};

const MakeAllocationTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "10px 12px",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
        fontSize: "12px",
      }}
    >
      <div style={{ fontWeight: 700, color: "#1f2937", marginBottom: "4px" }}>{label}</div>
      <div style={{ color: "#475569" }}>
        Shortage Qty: <strong style={{ color: "#0f172a" }}>{payload[0].value}</strong>
      </div>
    </div>
  );
};

const getCurrentMonthValue = () => new Date().toISOString().slice(0, 7);
const getCurrentYearValue = () => String(new Date().getFullYear());

const formatMonthLabel = (value) => {
  if (!value) return "";
  const [year, month] = String(value).split("-");
  const monthIndex = Number(month) - 1;
  const date = new Date(Number(year), monthIndex, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

const formatPeriodLabel = (period, month, year) =>
  period === "year" ? String(year || "") : formatMonthLabel(month);

const Dashboard = () => {
  const [kpi, setKpi] = useState({
    period: "month",
    month: getCurrentMonthValue(),
    year: getCurrentYearValue(),
    total_fixtures: 0,
    issued_fixtures: 0,
    pending_fixtures: 0,
    total_shortage_qty: 0,
  });

  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [selectedYear, setSelectedYear] = useState(getCurrentYearValue);
  const [makeAllocationChart, setMakeAllocationChart] = useState([]);
  const [loadingMakeChart, setLoadingMakeChart] = useState(true);

  useEffect(() => {
    const fetchKpi = () => {
      const token = localStorage.getItem("authToken");
      axios.get(`http://localhost:8000/dashboard/kpi`, {
        params: {
          period: selectedPeriod,
          month: selectedMonth,
          year: selectedYear,
        },
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        if (res.data) setKpi(res.data);
      })
      .catch((err) => {
        console.error("Dashboard KPI Fetch Error:", err);
      });
    };

    fetchKpi();
    const interval = setInterval(fetchKpi, 30000);
    return () => clearInterval(interval);
  }, [selectedMonth, selectedPeriod, selectedYear]);

  useEffect(() => {
    const fetchChart = () => {
      const token = localStorage.getItem("authToken");
      axios.get("http://localhost:8000/dashboard/make-allocation-chart", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        setMakeAllocationChart(Array.isArray(res.data) ? res.data : []);
        setLoadingMakeChart(false);
      })
      .catch((err) => {
        console.error("Dashboard Chart Fetch Error:", err);
        setLoadingMakeChart(false);
      });
    };

    fetchChart();
    const interval = setInterval(fetchChart, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num) => new Intl.NumberFormat().format(num || 0);
  const chartHeight = 300;
  const currentYear = Number(getCurrentYearValue());
  const yearOptions = Array.from({ length: 8 }, (_, index) => String(currentYear - 5 + index));
  const selectedPeriodLabel = formatPeriodLabel(
    kpi.period || selectedPeriod,
    kpi.month || selectedMonth,
    kpi.year || selectedYear
  );

  return (
    <>
      <PageWrapper
        title="Dashboard"
        subtitle={`KPI cards for ${selectedPeriodLabel}`}
        className="dashboard-page"
        actions={
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-field" style={{ minWidth: 140 }}>
              <label className="form-label">View By</label>
              <select
                className="form-control"
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
              >
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </div>

            {selectedPeriod === "month" ? (
              <div className="form-field" style={{ minWidth: 180 }}>
                <label className="form-label">Month & Year</label>
                <input
                  type="month"
                  className="form-control"
                  value={selectedMonth}
                  onChange={(event) => {
                    if (event.target.value) {
                      setSelectedMonth(event.target.value);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="form-field" style={{ minWidth: 140 }}>
                <label className="form-label">Year</label>
                <select
                  className="form-control"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value)}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        }
      >
        <ContentContainer scroll="auto">

          {/* KPI CARDS */}
          <div className="kpi-grid">
            <DashboardCard
              title="Total Fixtures"
              value={formatNumber(kpi.total_fixtures)}
              icon={<Package size={24} />}
              color="amber"
            />

            <DashboardCard
              title="Issued Fixtures"
              value={formatNumber(kpi.issued_fixtures)}
              icon={<Activity size={24} />}
              color="blue"
            />

            <DashboardCard
              title="Pending Fixtures"
              value={formatNumber(kpi.pending_fixtures)}
              icon={<Hourglass size={24} />}
              color="amber"
            />

            <DashboardCard
              title="Shortage Qty"
              value={formatNumber(kpi.total_shortage_qty)}
              icon={<Clock size={24} />}
              color="red"
            />
          </div>

          <Card className="panel" style={{ width: "100%" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 className="panel-title" style={{ margin: 0 }}>
                  Make Shortage Qty
                </h3>
                <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                  All makes from stock maintenance with summed shortage quantity from fixture job allocation.
                </div>
              </div>
            </div>

            {loadingMakeChart ? (
              <div className="table-empty" style={{ minHeight: `${chartHeight}px` }}>
                Loading chart...
              </div>
            ) : makeAllocationChart.length === 0 ? (
              <div className="table-empty" style={{ minHeight: `${chartHeight}px` }}>
                No makes found in stock maintenance.
              </div>
            ) : (
              <div style={{ height: `${chartHeight}px`, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={makeAllocationChart}
                    margin={{ top: 8, right: 16, left: 8, bottom: 56 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="category"
                      dataKey="make"
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={64}
                      tickMargin={10}
                      tick={{ fill: "#334155", fontSize: 11 }}
                      tickFormatter={formatMakeTick}
                      label={{
                        value: "Make",
                        position: "insideBottom",
                        offset: -6,
                        style: { fill: "#64748b", fontSize: 12 },
                      }}
                    />
                    <YAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      label={{
                        value: "Shortage Qty",
                        angle: -90,
                        position: "insideLeft",
                        style: { fill: "#64748b", fontSize: 12 },
                      }}
                    />
                    <Tooltip content={<MakeAllocationTooltip />} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={42}>
                      {makeAllocationChart.map((entry) => (
                        <Cell
                          key={entry.make}
                          fill={entry.count > 0 ? MAKE_BAR_COLORS.active : MAKE_BAR_COLORS.zero}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </ContentContainer>
      </PageWrapper>
    </>
  );
};

export default Dashboard;
