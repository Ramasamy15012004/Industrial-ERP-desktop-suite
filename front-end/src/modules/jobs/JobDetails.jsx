import React, { useEffect, useState } from "react";
import axios from "axios";
import Card from "../../components/ui/Card";
import TableContainer from "../../components/ui/TableContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import { HelpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CreateJob from "./CreateJob";

const JobDetails = () => {
  const [fixtures, setFixtures] = useState([]);

  const fetchFixtures = async () => {
    const res = await axios.get("http://localhost:8000/active-fixture-details");
    setFixtures(res.data);
  };

  useEffect(() => {
    fetchFixtures();
  }, []);

  const navigate = useNavigate();

  const handleHelpClick = () => {
    navigate("/help#jobs");
  };

  return (
    <div className="module-page">
      <div className="purchase-grid">
        <Card>
          <div style={styles.titleContainer}>
            <h3 className="section-title">Create Job</h3>
            <button
              onClick={handleHelpClick}
              style={styles.helpIconButton}
              className="help-icon-btn"
              title="Create and upload fixture BOMs from the same page."
            >
              <HelpCircle size={18} />
            </button>
          </div>
          <div style={styles.scrollBox}>
          <CreateJob embedded /></div>
        </Card>

        <Card>
          <div style={styles.titleContainer}>
            <h3 className="section-title">Active Fixtures</h3>
            <button
              onClick={handleHelpClick}
              style={styles.helpIconButton}
              className="help-icon-btn"
              title="This page shows fixtures in Reserved, Partial Reserved, Issued, and Shortage status."
            >
              <HelpCircle size={18} />
            </button>
          </div>

          <TableContainer>
            <table>
              <thead>
                <tr>
                  <th>Fixture Name</th>
                  <th>Fixture Qty</th>
                  <th>Created Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">
                      No active fixtures found.
                    </td>
                  </tr>
                ) : (
                  fixtures.map((fixture, index) => (
                    <tr key={`${fixture.product_details}-${index}`}>
                      <td>{fixture.product_details}</td>
                      <td>{fixture.fixture_qty}</td>
                      <td>{fixture.created_at || "-"}</td>
                      <td>
                        <StatusBadge status={fixture.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableContainer>
        </Card>
      </div>
    </div>
  );
};

const styles = {
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
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
  scrollBox: {
    maxHeight: "400px",   // adjust based on your layout
    overflowY: "auto",
    paddingRight: "8px",  // avoids scrollbar overlap
  },
};

export default JobDetails;
