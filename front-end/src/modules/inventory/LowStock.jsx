import React, { useEffect, useState } from "react";
import axios from "axios";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import TableContainer from "../../components/ui/TableContainer";
import { HelpCircle } from "lucide-react";

const InventoryDashboard = () => {
  // ================= LOW STOCK STATE =================
  const [lowStockData, setLowStockData] = useState([]);

  // ================= TRANSACTION STATE =================
  const [materialHistory, setMaterialHistory] = useState([]);
  const [materialFilter, setMaterialFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ================= FETCH TRANSACTIONS =================
  const fetchMaterialHistory = async () => {
    try {
      let url = "http://localhost:8000/material-transaction-history?";

      if (materialFilter) url += `bo_part_name=${encodeURIComponent(materialFilter)}&`;
      if (typeFilter) url += `transaction_type=${encodeURIComponent(typeFilter)}&`;
      if (fromDate) url += `from_date=${encodeURIComponent(fromDate)}&`;
      if (toDate) url += `to_date=${encodeURIComponent(toDate)}&`;

      const res = await axios.get(url);
      setMaterialHistory(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // ================= CLEAR FILTERS =================
  const clearFilters = () => {
    setMaterialFilter("");
    setTypeFilter("");
    setFromDate("");
    setToDate("");
    axios.get("http://localhost:8000/material-transaction-history?")
      .then((res) => setMaterialHistory(res.data))
      .catch((err) => console.error(err));
  };

  // ================= INITIAL LOAD =================
  useEffect(() => {
    let cancelled = false;

    const lowStockPromise = axios
      .get("http://localhost:8000/low-stock")
      .then((res) => {
        if (cancelled) return;
        setLowStockData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError("Failed to load low stock data");
      });

    const txPromise = axios
      .get("http://localhost:8000/material-transaction-history?")
      .then((res) => {
        if (cancelled) return;
        setMaterialHistory(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
      });

    Promise.all([lowStockPromise, txPromise]).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ================= HELP BUTTON HANDLER =================
  const handleHelpClick = (section) => {
    window.location.href = `/help#${section}`;
  };

  const materialOptions = Array.from(
    new Set(materialHistory.map((item) => item.bo_part_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="module-page scroll-auto">
      {/* Low Stock Materials Section with Help Icon */}

      {/* Stock Transactions History Section with Help Icon */}
      <div className="module-section grow">
        <div className="section-head">
          <div style={styles.sectionTitleContainer}>
            <h3 className="section-title">Material Transactions History</h3>
            <button
              onClick={() => handleHelpClick("inventory-transactions-history")}
              style={styles.helpIconButton}
              className="help-icon-btn"
              title="Full immutable history of BOM material transactions."
            >
              <HelpCircle size={18} />
            </button>
          </div>
        </div>

        <div className="filters-bar">
          <FormInput
            as="select"
            label="Material Name"
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
          >
            <option value="">All Materials</option>
            {materialOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FormInput>

          <FormInput
            as="select"
            label="Type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="PURCHASE ENTRY">Purchase Entry</option>
            <option value="RESERVED">Reserved</option>
            <option value="PARTIAL RESERVED">Partial Reserved</option>
            <option value="ISSUE">Issue</option>
            <option value="FIXTURE_MATERIAL_ISSUE">Fixture Issue</option>
          </FormInput>

          <FormInput
            type="date"
            label="From Date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />

          <FormInput
            type="date"
            label="To Date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />

          <div className="filters-actions">
            <PrimaryButton type="button" onClick={fetchMaterialHistory}>
              Apply Filter
            </PrimaryButton>
            <SecondaryButton type="button" onClick={clearFilters}>
              Clear
            </SecondaryButton>
          </div>
        </div>

        <TableContainer className="table-container-fill">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>BO Part Name</th>
                <th>Article Number</th>
                <th>Make</th>
                <th>Time</th>
                <th>Qty</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {materialHistory.length === 0 ? (
                <tr>
                  <td colSpan="7" className="table-empty">
                    No Transactions Found
                  </td>
                </tr>
              ) : (
                materialHistory.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.bo_part_name}</td>
                    <td>{t.article_number}</td>
                    <td>{t.make}</td>
                    <td className="fw-600 text-secondary">{t.event_time}</td>
                    <td>{t.qty}</td>
                    <td>{t.transaction_type}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableContainer>
      </div>
    </div>
  );
};

// Styles for the help buttons
const styles = {
  sectionTitleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  helpIconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: '0',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    color: '#6c757d',
  },
  floatingHelpContainer: {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: 1000,
  }
};

export default InventoryDashboard;
