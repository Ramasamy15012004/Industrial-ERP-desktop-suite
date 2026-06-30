import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import TableContainer from "../../components/ui/TableContainer";
import { HelpCircle, Trash2, Search, IndianRupee, X, Download } from "lucide-react";
import { Navigate } from "react-router-dom";
import { getUserRole } from "../../api/auth";
import { downloadWorkbookXlsx } from "../../utils/downloadWorkbook";

export default function MaterialMaster() {
  const role = getUserRole();
  const allowed = role === "admin" || role === "inventory" || role === "audit";
  const isAudit = role === "audit";

  const [stockMaintenance, setStockMaintenance] = useState([]);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPricePopup, setShowPricePopup] = useState(false);
  const [priceViewMode, setPriceViewMode] = useState("material"); // "material" | "make"
  const [selectedPriceRows, setSelectedPriceRows] = useState(new Set()); // keys of selected rows
  const [priceSearchInput, setPriceSearchInput] = useState("");
  const [priceSearch, setPriceSearch] = useState(""); // only set on Enter

  useEffect(() => {
    if (!allowed) return;
    axios
      .get("http://localhost:8000/stock-maintenance")
      .then((res) => setStockMaintenance(res.data))
      .catch(() => setError("Failed to load stock maintenance data"));
  }, [allowed]);

  const handleHelpClick = () => {
    window.location.href = "/help#inventory-material-master";
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Are you sure you want to delete "${item.part_name}"?`)) {
      return;
    }

    try {
      await axios.delete(`http://localhost:8000/stock-maintenance/${item.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` }
      });
      // Refresh the list
      const res = await axios.get("http://localhost:8000/stock-maintenance", {
        headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` }
      });
      setStockMaintenance(res.data);
    } catch (error) {
      setError(error.response?.data?.detail || "Failed to delete item");
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleExport = async () => {
    if (filteredStockMaintenance.length === 0) {
      setError("No material master data available to export");
      return;
    }

    const toFiniteNumber = (value, fallback = 0) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : fallback;
    };

    const exportRows = filteredStockMaintenance.map((item) => {
      const onHandQty = toFiniteNumber(item.qty, 0);
      const reservedQty = toFiniteNumber(item.reserved_qty, 0);
      const minStock = toFiniteNumber(item.minimum_stock, 0);
      const availableQty = onHandQty - reservedQty;
      const leadDays = item.lead_days == null ? "" : String(item.lead_days).trim();
      const price = toFiniteNumber(item.price, 0);

      let stockStatus = "OK";
      if (availableQty <= 0) {
        stockStatus = "Out of Stock";
      } else if (availableQty < minStock) {
        stockStatus = "Below Minimum";
      }

      return {
        "Part Name": item.part_name || "",
        "Article Number": item.article_number || "",
        Make: item.make || "",
        "On Hand Qty": onHandQty,
        "Reserved Qty": reservedQty,
        "Available Qty": availableQty,
        "Min Stock": minStock,
        "Lead Days": leadDays,
        Price: price,
        "Last Purchase": item.last_purchase_date || "",
        Status: stockStatus,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Material Master");

    worksheet["!cols"] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
    ];

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    try {
      const saved = await downloadWorkbookXlsx(workbook, `material-master-${timestamp}.xlsx`);
      if (saved) {
        setError("");
      }
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      setError("Failed to export material master file");
    }
  };

  const filteredStockMaintenance = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return stockMaintenance;

    return stockMaintenance.filter((item) => {
      const partNameMatch = String(item.part_name || "").toLowerCase().includes(query);
      const articleNumberMatch = String(item.article_number || "").toLowerCase().includes(query);
      const makeMatch = String(item.make || "").toLowerCase().includes(query);

      const qty = Number(item.qty ?? 0);
      const reservedQty = Number(item.reserved_qty ?? 0);
      const minimumStock = Number(item.minimum_stock ?? 0);
      const availableQty = qty - reservedQty;
      const shortageMatch = availableQty < minimumStock;

      return (
        partNameMatch ||
        articleNumberMatch ||
        makeMatch ||
        (query.toLowerCase() === "shortage" && shortageMatch)
      );
    });
  }, [stockMaintenance, searchQuery]);

  const priceData = useMemo(() => {
    if (!showPricePopup) return [];

    let result;
    if (priceViewMode === "material") {
      result = stockMaintenance.map((item, index) => {
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        return {
          key: String(item.id ?? `${item.part_name || "part"}-${item.article_number || "article"}-${item.make || "make"}-${index}`),
          article_number: item.article_number || "-",
          part_name: item.part_name || "-",
          make: item.make || "-",
          total_qty: qty,
          unit_price: price,
          total_price: qty * price,
        };
      }).sort((a, b) => b.total_price - a.total_price);
    } else {
      const map = {};
      stockMaintenance.forEach((item) => {
        const displayMake = String(item.make || "").trim() || "Unknown";
        const key = displayMake.toLowerCase();
        if (!map[key]) {
          map[key] = { key, make: displayMake, item_count: 0, total_qty: 0, total_price: 0 };
        }
        const qty = Number(item.qty || 0);
        const price = Number(item.price || 0);
        map[key].item_count += 1;
        map[key].total_qty += qty;
        map[key].total_price += qty * price;
      });
      result = Object.values(map).sort((a, b) => b.total_price - a.total_price);
    }
    // Auto-select all rows when data changes
    setSelectedPriceRows(new Set(result.map((r) => r.key)));
    return result;
  }, [showPricePopup, priceViewMode, stockMaintenance]);

  const filteredPriceData = useMemo(() => {
    if (!priceSearch.trim()) return priceData;
    const q = priceSearch.trim().toLowerCase();
    return priceData.filter((row) => {
      if (priceViewMode === "material") {
        return (
          (row.part_name || "").toLowerCase().includes(q) ||
          (row.article_number || "").toLowerCase().includes(q) ||
          (row.make || "").toLowerCase().includes(q)
        );
      } else {
        return (row.make || "").toLowerCase().includes(q);
      }
    });
  }, [priceData, priceSearch, priceViewMode]);

  const grandTotal = useMemo(() => {
    return filteredPriceData
      .filter((row) => selectedPriceRows.has(row.key))
      .reduce((sum, row) => sum + (row.total_price || 0), 0);
  }, [filteredPriceData, selectedPriceRows]);

  const togglePriceRow = (key) => {
    setSelectedPriceRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllPriceRows = () => {
    if (selectedPriceRows.size === filteredPriceData.length && filteredPriceData.every(r => selectedPriceRows.has(r.key))) {
      // Deselect only the visible/filtered rows
      setSelectedPriceRows((prev) => {
        const next = new Set(prev);
        filteredPriceData.forEach((r) => next.delete(r.key));
        return next;
      });
    } else {
      // Select all visible/filtered rows
      setSelectedPriceRows((prev) => {
        const next = new Set(prev);
        filteredPriceData.forEach((r) => next.add(r.key));
        return next;
      });
    }
  };

  const formatCurrency = (val) => {
    if (val == null || isNaN(val)) return "-";
    return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (!allowed) {
    return <Navigate to="/inventory/transactions" replace />;
  }

  const getRowStyle = (item) => {
    const qty = Number(item.qty ?? 0);
    const reservedQty = Number(item.reserved_qty ?? 0);
    const minimumStock = Number(item.minimum_stock ?? 0);
    const availableQty = qty - reservedQty;

    if (availableQty <= 0) {
      return { backgroundColor: "#fee2e2" };
    }

    if (availableQty < minimumStock) {
      return { backgroundColor: "#ffedd5" };
    }

    return undefined;
  };

  return (
    <div className="module-page">
      <div className="section-head">
        <div style={styles.titleContainer}>
          <h3 className="section-title">Material Master</h3>
          <button
            onClick={handleHelpClick}
            style={styles.helpIconButton}
            className="help-icon-btn"
            title="Material Master is the main control table for all materials in your system"
          >
            <HelpCircle size={18} />
          </button>
        </div>


        <div style={styles.searchBar}>
          <input
            type="text"
            className="form-control form-control-inline"
            placeholder="Search by part name, article number, make, or type 'shortage'"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={styles.searchInput}
          />
          <button
            type="button"
            style={styles.searchButton}
            onClick={handleSearch}
            aria-label="Search material master"
            title="Search material master"
          >
            <Search size={15} />
          </button>
          <button
            type="button"
            style={styles.priceButton}
            onClick={() => setShowPricePopup(true)}
            title="View total price summary"
          >
            <IndianRupee size={15} />
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Price</span>
          </button>
          <button
            type="button"
            style={styles.exportButton}
            onClick={handleExport}
            title="Export material master to Excel"
          >
            <Download size={15} />
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Export</span>
          </button>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="module-section grow">
        <TableContainer className="table-container-fill">
          <table>
            <thead>
              <tr>
                <th>Part Name</th>
                <th>Article Number</th>
                <th>Make</th>
                <th>On Hand Qty</th>
                <th>Reserved Qty</th>
                <th>Min Stock</th>
                <th>Lead Days</th>
                <th>Price</th>
                <th>Last Purchase</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStockMaintenance.length === 0 ? (
                <tr>
                  <td colSpan="10" className="table-empty">
                    {stockMaintenance.length === 0 ? "No stock maintenance records" : "No matching records found"}
                  </td>
                </tr>
              ) : (
                filteredStockMaintenance.map((s) => (
                  <tr key={s.id} style={getRowStyle(s)}>
                    <td>{s.part_name}</td>
                    <td>{s.article_number}</td>
                    <td>{s.make}</td>
                    <td>{s.qty}</td>
                    <td>{s.reserved_qty}</td>
                    <td>{s.minimum_stock}</td>
                    <td>{s.lead_days}</td>
                    <td>{s.price ? `₹${s.price.toFixed(2)}` : "-"}</td>
                    <td>{s.last_purchase_date || "-"}</td>
                    <td>
                      {!isAudit && (
                        <button
                          onClick={() => handleDelete(s)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#dc2626",
                            padding: "4px",
                            borderRadius: "4px"
                          }}
                          title="Deactivate item"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableContainer>
      </div>

      {/* ── Price Summary Popup ── */}
      {showPricePopup && (
        <div style={styles.overlay} onClick={() => { setShowPricePopup(false); setPriceSearchInput(""); setPriceSearch(""); }}>
          <div style={styles.popup} onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div style={styles.popupHeader}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Stock Price Summary</h3>
              <button onClick={() => { setShowPricePopup(false); setPriceSearchInput(""); setPriceSearch(""); }} style={styles.closeBtn}><X size={18} /></button>
            </div>

            {/* Toggle Tabs */}
            <div style={styles.tabRow}>
              <button
                style={priceViewMode === "material" ? styles.tabActive : styles.tab}
                onClick={() => { setPriceViewMode("material"); setPriceSearchInput(""); setPriceSearch(""); }}
              >
                Material Wise
              </button>
              <button
                style={priceViewMode === "make" ? styles.tabActive : styles.tab}
                onClick={() => { setPriceViewMode("make"); setPriceSearchInput(""); setPriceSearch(""); }}
              >
                Make Wise
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: "0 16px 10px 16px", position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: "28px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
              <input
                type="text"
                placeholder={priceViewMode === "material" ? "Search by part name, article no, or make… (press Enter)" : "Search by make… (press Enter)"}
                value={priceSearchInput}
                onChange={(e) => setPriceSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setPriceSearch(priceSearchInput);
                }}
                style={{
                  width: "100%",
                  padding: "8px 34px 8px 36px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#7c3aed")}
                onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
              />
              {priceSearchInput && (
                <button
                  onClick={() => { setPriceSearchInput(""); setPriceSearch(""); }}
                  style={{
                    position: "absolute", right: "28px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "2px",
                    display: "flex", alignItems: "center",
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Table */}
            <div style={styles.popupTableWrap}>
              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f1f5f9" }}>
                    <th style={{ ...styles.th, width: "36px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={filteredPriceData.length > 0 && filteredPriceData.every(r => selectedPriceRows.has(r.key))}
                        onChange={toggleAllPriceRows}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    {priceViewMode === "material" ? (
                      <>
                        <th style={styles.th}>Part Name</th>
                        <th style={styles.th}>Article No.</th>
                        <th style={styles.th}>Make</th>
                        <th style={styles.thR}>Unit Price</th>
                        <th style={styles.thR}>Qty</th>
                        <th style={styles.thR}>Total Price</th>
                      </>
                    ) : (
                      <>
                        <th style={styles.th}>Make</th>
                        <th style={styles.thR}>Items</th>
                        <th style={styles.thR}>Total Qty</th>
                        <th style={styles.thR}>Total Price</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredPriceData.length === 0 ? (
                    <tr>
                      <td colSpan={priceViewMode === "material" ? 7 : 5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>
                        {priceSearch ? "No matching results" : "No data available"}
                      </td>
                    </tr>
                  ) : (
                    filteredPriceData.map((row, i) => {
                      const isSelected = selectedPriceRows.has(row.key);
                      return (
                        <tr
                          key={row.key}
                          style={{
                            backgroundColor: isSelected
                              ? (i % 2 === 0 ? "#fff" : "#f8fafc")
                              : "#f1f5f9",
                            opacity: isSelected ? 1 : 0.5,
                            cursor: "pointer",
                          }}
                          onClick={() => togglePriceRow(row.key)}
                        >
                          <td style={{ ...styles.td, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePriceRow(row.key)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          {priceViewMode === "material" ? (
                            <>
                              <td style={styles.td}>{row.part_name}</td>
                              <td style={styles.td}>{row.article_number}</td>
                              <td style={styles.td}>{row.make}</td>
                              <td style={styles.tdR}>{formatCurrency(row.unit_price)}</td>
                              <td style={styles.tdR}>{row.total_qty}</td>
                              <td style={styles.tdR}>{formatCurrency(row.total_price)}</td>
                            </>
                          ) : (
                            <>
                              <td style={styles.td}>{row.make}</td>
                              <td style={styles.tdR}>{row.item_count}</td>
                              <td style={styles.tdR}>{row.total_qty}</td>
                              <td style={styles.tdR}>{formatCurrency(row.total_price)}</td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredPriceData.length > 0 && (
                  <tfoot>
                    <tr style={{ backgroundColor: "#e2e8f0", fontWeight: 700 }}>
                      {priceViewMode === "material" ? (
                        <>
                          <td style={{ ...styles.td, textAlign: "center", fontSize: "11px", color: "#475569" }}>
                            {filteredPriceData.filter(r => selectedPriceRows.has(r.key)).length}/{filteredPriceData.length}
                          </td>
                          <td colSpan={5} style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>Grand Total</td>
                          <td style={{ ...styles.tdR, fontWeight: 700 }}>{formatCurrency(grandTotal)}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...styles.td, textAlign: "center", fontSize: "11px", color: "#475569" }}>
                            {filteredPriceData.filter(r => selectedPriceRows.has(r.key)).length}/{filteredPriceData.length}
                          </td>
                          <td colSpan={3} style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>Grand Total</td>
                          <td style={{ ...styles.tdR, fontWeight: 700 }}>{formatCurrency(grandTotal)}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  helpIconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    padding: "0",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "50%",
    cursor: "pointer",
    transition: "all 0.2s ease",
    color: "#6c757d",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: "380px",
    marginBottom: "16px",
  },
  searchInput: {
    width: "100%",
  },

  searchButton: {
    width: "34px",
    height: "34px",
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    backgroundColor: "#ffffff",
    color: "#6b7280",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  priceButton: {
    height: "34px",
    padding: "0 12px",
    border: "1px solid #7c3aed",
    borderRadius: "10px",
    backgroundColor: "#7c3aed",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    cursor: "pointer",
    flexShrink: 0,
    transition: "opacity 0.15s",
  },
  exportButton: {
    height: "34px",
    padding: "0 12px",
    border: "1px solid #0f766e",
    borderRadius: "10px",
    backgroundColor: "#0f766e",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    cursor: "pointer",
    flexShrink: 0,
    transition: "opacity 0.15s",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  popup: {
    backgroundColor: "#fff",
    borderRadius: "12px",
    width: "min(780px, 92vw)",
    height: "80vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  popupHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
  },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#64748b",
    padding: "4px",
    borderRadius: "6px",
  },
  tabRow: {
    display: "flex",
    gap: "8px",
    padding: "12px 20px",
  },
  tab: {
    padding: "6px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    backgroundColor: "#fff",
    color: "#64748b",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
  },
  tabActive: {
    padding: "6px 16px",
    border: "1px solid #7c3aed",
    borderRadius: "8px",
    backgroundColor: "#7c3aed",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  popupTableWrap: {
    flex: 1,
    overflowY: "auto",
    padding: "0 20px 20px",
  },
  th: { padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#475569", borderBottom: "2px solid #e2e8f0" },
  thR: { padding: "8px 10px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#475569", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "6px 10px", borderBottom: "1px solid #f1f5f9" },
  tdR: { padding: "6px 10px", textAlign: "right", borderBottom: "1px solid #f1f5f9" },
};
