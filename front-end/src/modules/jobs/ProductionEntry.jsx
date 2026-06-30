import React, { useEffect, useState } from "react";
import axios from "axios";
import FormContainer from "../../components/ui/FormContainer";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import TableContainer from "../../components/ui/TableContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import { HelpCircle, X } from "lucide-react";
import { Navigate } from "react-router-dom";
import { getUserRole } from "../../api/auth";

const formatCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const ProductionEntry = () => {
  const role = getUserRole();
  const allowed = role === "admin" || role === "production" || role === "audit";
  const isAudit = role === "audit";

  const [issuedFixtures, setIssuedFixtures] = useState([]);
  const [completeFixture, setCompleteFixture] = useState(null);
  const [completingFixture, setCompletingFixture] = useState(false);
  const [formData, setFormData] = useState({
    product_details: "",
    finished_at: formatCurrentDateTime(),
    finished_qty: "",
    remarks: "",
  });

  const refreshIssuedFixtures = async () => {
    const res = await axios.get("http://localhost:8000/fixture-bom/list");
    setIssuedFixtures(res.data.filter((fixture) => fixture.status === "Issued"));
  };

  useEffect(() => {
    if (!allowed) return;
    refreshIssuedFixtures();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;

    const timer = setInterval(() => {
      setFormData((prev) => ({ ...prev, finished_at: formatCurrentDateTime() }));
    }, 60000);

    return () => clearInterval(timer);
  }, [allowed]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleFixtureSelect = (productDetails) => {
    const selectedFixture = issuedFixtures.find((fixture) => fixture.product_details === productDetails);
    setFormData((prev) => ({
      ...prev,
      product_details: productDetails,
      finished_qty: selectedFixture ? String(selectedFixture.fixture_qty) : "",
    }));
  };

  const handleSubmit = async () => {
    if (!formData.product_details) {
      alert("Select an Issued Fixture");
      return;
    }

    try {
      const res = await axios.post("http://localhost:8000/fixture-bom/production-entry", {
        product_details: formData.product_details,
        finished_at: formData.finished_at,
        finished_qty: Number(formData.finished_qty),
        remarks: formData.remarks,
      });

      alert(res.data.message || "Production Entry Saved");

      setFormData({
        product_details: "",
        finished_at: formatCurrentDateTime(),
        finished_qty: "",
        remarks: "",
      });

      await refreshIssuedFixtures();
    } catch (err) {
      alert(err.response?.data?.detail || "Error saving production");
    }
  };

  const handleCompleteFixture = async () => {
    if (!completeFixture) return;

    try {
      setCompletingFixture(true);
      const res = await axios.post(
        `http://localhost:8000/fixture-bom/complete/${encodeURIComponent(completeFixture.product_details)}`
      );
      alert(res.data.message);
      setCompleteFixture(null);
      await refreshIssuedFixtures();
      setFormData((prev) =>
        prev.product_details === completeFixture.product_details
          ? { ...prev, product_details: "", finished_qty: "", remarks: "" }
          : prev
      );
    } catch (err) {
      alert(err.response?.data?.detail || "Error completing fixture");
    } finally {
      setCompletingFixture(false);
    }
  };

  const handleHelpClick = () => {
    window.location.href = "/help#jobs-production-entry";
  };

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="module-page scroll-auto">
      <div style={styles.titleContainer}>
        <h3 className="section-title">Production Entry</h3>
        <button
          onClick={handleHelpClick}
          style={styles.helpIconButton}
          className="help-icon-btn"
          title="Production Entry is used to record fixture production details and mark issued fixtures as completed."
        >
          <HelpCircle size={18} />
        </button>
      </div>

      <FormContainer>
        <div className="form-grid">
          <FormInput
            as="select"
            label="Job"
            value={formData.product_details}
            onChange={(e) => handleFixtureSelect(e.target.value)}
          >
            <option value="">Select Issued Fixture</option>
            {issuedFixtures.map((fixture) => (
              <option key={fixture.id} value={fixture.product_details}>
                {fixture.product_details}
              </option>
            ))}
          </FormInput>

          <FormInput
            type="text"
            name="finished_at"
            label="Shift"
            value={formData.finished_at}
            readOnly
          />

          <FormInput
            type="number"
            name="finished_qty"
            label="Finished Quantity"
            value={formData.finished_qty}
            readOnly
            placeholder="0"
          />
        </div>

        <FormInput
          as="textarea"
          name="remarks"
          label="Remarks"
          value={formData.remarks}
          onChange={handleChange}
          placeholder="Add any notes..."
        />

        {!isAudit && (
          <div className="form-actions">
            <PrimaryButton type="button" onClick={handleSubmit}>
              Save Production
            </PrimaryButton>
          </div>
        )}
      </FormContainer>

      {/* <div style={styles.fixtureSection}>
        <div style={styles.fixtureHeader}>
          <h4 className="section-title small" style={{ margin: 0 }}>Issued Fixtures</h4>
          <span style={styles.fixtureCount}>{issuedFixtures.length} items</span>
        </div>

        <TableContainer className="table-container-sm">
          <table>
            <thead>
              <tr>
                <th>Fixture Name</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {issuedFixtures.length === 0 ? (
                <tr>
                  <td colSpan="4" className="table-empty">No issued fixtures found</td>
                </tr>
              ) : (
                issuedFixtures.map((fixture) => (
                  <tr key={fixture.id}>
                    <td>{fixture.product_details}</td>
                    <td>{fixture.fixture_qty}</td>
                    <td><StatusBadge status={fixture.status} /></td>
                    <td>
                      <PrimaryButton type="button" className="btn-sm" onClick={() => setCompleteFixture(fixture)}>
                        Completed
                      </PrimaryButton>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableContainer>
      </div> */}

      {completeFixture && (
        <div className="blur-overlay" style={styles.modalOverlay} onClick={() => !completingFixture && setCompleteFixture(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h4 style={{ margin: 0, fontSize: "16px", color: "#374151" }}>Confirm Fixture Completion</h4>
              <button
                type="button"
                style={styles.closeButton}
                onClick={() => !completingFixture && setCompleteFixture(null)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={styles.modalText}>
              Fixture: <strong>{completeFixture.product_details}</strong>
            </p>
            <p style={styles.modalText}>
              Quantity: <strong>{completeFixture.fixture_qty}</strong>
            </p>
            <p style={{ ...styles.modalText, color: "#6b7280" }}>
              When you confirm, the fixture status will change from <strong>Issued</strong> to <strong>Completed</strong>.
            </p>

            <div style={styles.modalActions}>
              <SecondaryButton type="button" onClick={() => setCompleteFixture(null)} disabled={completingFixture}>
                Cancel
              </SecondaryButton>
              {!isAudit && (
                <PrimaryButton type="button" onClick={handleCompleteFixture} disabled={completingFixture}>
                  {completingFixture ? "Completing..." : "Confirm"}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
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
  fixtureSection: {
    marginTop: "20px",
  },
  fixtureHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  fixtureCount: {
    fontSize: "12px",
    fontWeight: "600",
    color: "#6b7280",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 1200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  },
  modalCard: {
    width: "min(420px, 100%)",
    backgroundColor: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "14px",
  },
  closeButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalText: {
    margin: "0 0 10px",
    fontSize: "14px",
    color: "#374151",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "16px",
  },
};

export default ProductionEntry;
