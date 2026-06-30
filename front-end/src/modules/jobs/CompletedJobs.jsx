import React, { useEffect, useState } from "react";
import axios from "axios";
import TableContainer from "../../components/ui/TableContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import { HelpCircle } from "lucide-react";
import { Navigate } from "react-router-dom";
import { getUserRole } from "../../api/auth";

const CompletedJobs = () => {
  const role = getUserRole();
  const allowed = role === "admin" || role === "planner";

  const [fixtures, setFixtures] = useState([]);
  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchCompletedFixtures = async (nextFilters = filters) => {
    if (!allowed) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (nextFilters.from_date) params.append("from_date", nextFilters.from_date);
      if (nextFilters.to_date) params.append("to_date", nextFilters.to_date);

      const url = params.toString()
        ? `http://localhost:8000/completed-fixtures?${params.toString()}`
        : "http://localhost:8000/completed-fixtures";

      const res = await axios.get(url);
      setFixtures(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load completed fixtures");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompletedFixtures();
  }, [allowed]);

  const handleHelpClick = () => {
    window.location.href = "/help#jobs-completed-jobs";
  };

  const handleApply = () => {
    fetchCompletedFixtures(filters);
  };

  const handleClear = () => {
    const cleared = { from_date: "", to_date: "" };
    setFilters(cleared);
    fetchCompletedFixtures(cleared);
  };

  if (!allowed) {
    return <Navigate to="/jobs/details" replace />;
  }

  return (
    <div className="module-page">
      <div style={styles.titleContainer}>
        <h3 className="section-title">Completed Fixtures</h3>
        <button
          onClick={handleHelpClick}
          style={styles.helpIconButton}
          className="help-icon-btn"
          title="Completed Fixtures shows finished fixture records with issue time and completed time"
        >
          <HelpCircle size={18} />
        </button>
      </div>

      <div className="filters-bar">
        <FormInput
          label="From Date"
          type="date"
          value={filters.from_date}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, from_date: event.target.value }))
          }
        />
        <FormInput
          label="To Date"
          type="date"
          value={filters.to_date}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, to_date: event.target.value }))
          }
        />
        <div className="filters-actions">
          <PrimaryButton type="button" onClick={handleApply}>
            Apply Filter
          </PrimaryButton>
          <SecondaryButton type="button" onClick={handleClear}>
            Clear
          </SecondaryButton>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <TableContainer>
        <table>
          <thead>
            <tr>
              <th>Fixture Name</th>
              <th>Fixture Qty</th>
              <th>Issue Time</th>
              <th>Completed Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="table-empty">
                  Loading completed fixtures...
                </td>
              </tr>
            ) : fixtures.length === 0 ? (
              <tr>
                <td colSpan="5" className="table-empty">
                  No completed fixtures found.
                </td>
              </tr>
            ) : (
              fixtures.map((fixture, index) => (
                <tr key={`${fixture.product_details}-${index}`}>
                  <td>{fixture.product_details}</td>
                  <td>{fixture.fixture_qty}</td>
                  <td>{fixture.issue_time || "-"}</td>
                  <td>{fixture.completed_time || "-"}</td>
                  <td>
                    <StatusBadge status={fixture.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableContainer>
    </div>
  );
};

const styles = {
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "20px",
  },
  helpIconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    padding: "0",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
    transition: "all 0.2s ease",
    color: "#6c757d",
  },
};

export default CompletedJobs;
