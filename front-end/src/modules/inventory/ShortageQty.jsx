import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Download, Search } from "lucide-react";
import FormInput from "../../components/ui/FormInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import TableContainer from "../../components/ui/TableContainer";
import { downloadWorkbookXlsx } from "../../utils/downloadWorkbook";

const SHORTAGE_API = "http://localhost:8000/inventory/shortage-qty";
const LOW_STOCK_API = "http://localhost:8000/inventory/low-stock-materials";

export default function ShortageQty() {
  const [activeTab, setActiveTab] = useState("fixture"); // "fixture" | "lowstock"

  // Fixture shortage state
  const [selectedFixture, setSelectedFixture] = useState("");
  const [selectedFixtureMake, setSelectedFixtureMake] = useState("");
  const [allRows, setAllRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Low stock state
  const [lowStockRows, setLowStockRows] = useState([]);
  const [selectedLowStockMake, setSelectedLowStockMake] = useState("");
  const [appliedLowStockMake, setAppliedLowStockMake] = useState("");
  const [lowStockSearchInput, setLowStockSearchInput] = useState("");
  const [lowStockSearchQuery, setLowStockSearchQuery] = useState("");
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockError, setLowStockError] = useState("");
  const [lowStockFetched, setLowStockFetched] = useState(false);

  const fetchRows = async ({ fixtureName = "", make = "" } = {}) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (fixtureName.trim()) params.append("product_details", fixtureName.trim());
      if (make.trim()) params.append("make", make.trim());

      const url = params.toString() ? `${SHORTAGE_API}?${params.toString()}` : SHORTAGE_API;
      const res = await axios.get(url);
      const data = Array.isArray(res.data) ? res.data : [];
      setRows(data);

      if (!fixtureName.trim() && !make.trim()) {
        setAllRows(data);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load shortage quantity data");
    } finally {
      setLoading(false);
    }
  };

  const fetchLowStock = async () => {
    setLowStockLoading(true);
    setLowStockError("");
    try {
      const res = await axios.get(LOW_STOCK_API);
      setLowStockRows(Array.isArray(res.data) ? res.data : []);
      setLowStockFetched(true);
    } catch (err) {
      console.error(err);
      setLowStockError("Failed to load low stock data");
    } finally {
      setLowStockLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "lowstock" && !lowStockFetched) {
      fetchLowStock();
    }
  };

  const fixtureOptions = useMemo(() => {
    const filteredRows = selectedFixtureMake
      ? allRows.filter(
          (row) =>
            String(row.make || "").trim().toLowerCase() ===
            selectedFixtureMake.trim().toLowerCase()
        )
      : allRows;

    return Array.from(
      new Set(filteredRows.map((row) => row.product_details).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [allRows, selectedFixtureMake]);

  const fixtureMakeOptions = useMemo(() => {
    const filteredRows = selectedFixture
      ? allRows.filter(
          (row) =>
            String(row.product_details || "").trim().toLowerCase() ===
            selectedFixture.trim().toLowerCase()
        )
      : allRows;

    return Array.from(
      new Set(filteredRows.map((row) => row.make).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [allRows, selectedFixture]);

  const lowStockMakeOptions = useMemo(() => {
    return Array.from(
      new Set(lowStockRows.map((row) => row.make).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [lowStockRows]);

  const filteredLowStockRows = useMemo(() => {
    const makeFilteredRows = !appliedLowStockMake.trim()
      ? lowStockRows
      : lowStockRows.filter(
          (row) =>
            String(row.make || "").trim().toLowerCase() ===
            appliedLowStockMake.trim().toLowerCase()
        );

    const query = lowStockSearchQuery.trim().toLowerCase();
    if (!query) return makeFilteredRows;

    return makeFilteredRows.filter((row) => {
      const partNameMatch = String(row.part_name || "").toLowerCase().includes(query);
      const articleNumberMatch = String(row.article_number || "").toLowerCase().includes(query);
      const makeMatch = String(row.make || "").toLowerCase().includes(query);

      const qty = Number(row.qty ?? 0);
      const reservedQty = Number(row.reserved_qty ?? 0);
      const minimumStock = Number(row.minimum_stock ?? 0);
      const availableQty = Number(row.available_qty ?? (qty - reservedQty));
      const shortageMatch = availableQty < minimumStock;

      return (
        partNameMatch ||
        articleNumberMatch ||
        makeMatch ||
        (query === "shortage" && shortageMatch)
      );
    });
  }, [lowStockRows, appliedLowStockMake, lowStockSearchQuery]);

  useEffect(() => {
    if (selectedFixture && !fixtureOptions.includes(selectedFixture)) {
      setSelectedFixture("");
    }
  }, [fixtureOptions, selectedFixture]);

  useEffect(() => {
    if (selectedFixtureMake && !fixtureMakeOptions.includes(selectedFixtureMake)) {
      setSelectedFixtureMake("");
    }
  }, [fixtureMakeOptions, selectedFixtureMake]);

  useEffect(() => {
    if (selectedLowStockMake && !lowStockMakeOptions.includes(selectedLowStockMake)) {
      setSelectedLowStockMake("");
      if (appliedLowStockMake === selectedLowStockMake) {
        setAppliedLowStockMake("");
      }
    }
  }, [appliedLowStockMake, lowStockMakeOptions, selectedLowStockMake]);

  const handleApply = () => {
    fetchRows({ fixtureName: selectedFixture, make: selectedFixtureMake });
  };

  const handleClear = () => {
    setSelectedFixture("");
    setSelectedFixtureMake("");
    fetchRows();
  };

  const handleLowStockApply = () => {
    setAppliedLowStockMake(selectedLowStockMake);
  };

  const handleLowStockSearch = () => {
    setLowStockSearchQuery(lowStockSearchInput);
  };

  const handleLowStockClear = () => {
    setSelectedLowStockMake("");
    setAppliedLowStockMake("");
    setLowStockSearchInput("");
    setLowStockSearchQuery("");
  };

  const formatLeadDays = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    return value;
  };

  const isMissingInStockMaintenance = (row) => Boolean(row?.missing_in_stock_maintenance);
  const getLowStockCurrentQty = (row) =>
    Number(row?.available_qty ?? (Number(row?.qty ?? 0) - Number(row?.reserved_qty ?? 0)));

  const exportToExcel = async (sheetName, filePrefix, exportRows, emptyMessage) => {
    if (!exportRows.length) {
      if (activeTab === "fixture") {
        setError(emptyMessage);
      } else {
        setLowStockError(emptyMessage);
      }
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet["!cols"] = Object.keys(exportRows[0]).map((key) => ({
      wch: Math.max(
        key.length + 2,
        ...exportRows.map((row) => String(row[key] ?? "").length + 2)
      ),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    try {
      const saved = await downloadWorkbookXlsx(workbook, `${filePrefix}-${timestamp}.xlsx`);

      if (saved) {
        if (activeTab === "fixture") {
          setError("");
        } else {
          setLowStockError("");
        }
      }
    } catch {
      if (activeTab === "fixture") {
        setError("Failed to export fixture shortage file");
      } else {
        setLowStockError("Failed to export low stock file");
      }
    }
  };

  const handleFixtureExport = async () => {
    const exportRows = rows.map((row) => ({
      "Fixture Name": row.product_details || "",
      "Part Name": row.part_name || "",
      "Article Number": row.article_number || "",
      Make: row.make || "",
      "Shortage Qty": Number(row.shortage_qty ?? 0),
      "Lead Days": formatLeadDays(row.lead_days),
      "Stock Maintenance Status": isMissingInStockMaintenance(row)
        ? "Not in Stock Maintenance"
        : "Available",
    }));

    await exportToExcel(
      "Fixture Shortage",
      "fixture-shortage",
      exportRows,
      "No fixture shortage data available to export"
    );
  };

  const handleLowStockExport = async () => {
    const exportRows = filteredLowStockRows.map((row) => ({
      "Part Name": row.part_name || "",
      "Article Number": row.article_number || "",
      Make: row.make || "",
      "Current Qty": getLowStockCurrentQty(row),
      "Min Stock": Number(row.minimum_stock ?? 0),
      "Lead Days": formatLeadDays(row.lead_days),
    }));

    await exportToExcel(
      "Low Stock Materials",
      "low-stock-materials",
      exportRows,
      "No low stock data available to export"
    );
  };

  return (
    <div className="module-page scroll-auto">
      <div className="module-section grow">
        <div className="section-head">
          <h3 className="section-title">Shortage QTY</h3>
        </div>

        <div style={tabStyles.tabRow}>
          <button
            style={activeTab === "fixture" ? tabStyles.tabActive : tabStyles.tab}
            onClick={() => handleTabChange("fixture")}
          >
            Fixture Shortage
          </button>
          <button
            style={activeTab === "lowstock" ? tabStyles.tabActive : tabStyles.tab}
            onClick={() => handleTabChange("lowstock")}
          >
            Low Stock Materials
          </button>
        </div>

        {activeTab === "fixture" && (
          <>
            <div className="filters-bar">
              <FormInput
                as="select"
                label="Fixture Name"
                value={selectedFixture}
                onChange={(event) => setSelectedFixture(event.target.value)}
              >
                <option value="">All Shortage Fixtures</option>
                {fixtureOptions.map((fixture) => (
                  <option key={fixture} value={fixture}>
                    {fixture}
                  </option>
                ))}
              </FormInput>

              <FormInput
                as="select"
                label="Make"
                value={selectedFixtureMake}
                onChange={(event) => setSelectedFixtureMake(event.target.value)}
              >
                <option value="">All Makes</option>
                {fixtureMakeOptions.map((make) => (
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </FormInput>

              <div className="filters-actions">
                <PrimaryButton type="button" onClick={handleApply}>
                  Apply Filter
                </PrimaryButton>
                <SecondaryButton type="button" onClick={handleClear}>
                  Clear
                </SecondaryButton>
                <button
                  type="button"
                  style={shortageStyles.exportButton}
                  onClick={handleFixtureExport}
                  title="Export fixture shortage to Excel"
                >
                  <Download size={15} />
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>Export</span>
                </button>
              </div>
            </div>

            {error && <div className="form-error">{error}</div>}
            <div style={shortageStyles.legend}>
              Highlighted rows show part name in fixture shortage not found in stock maintenance.
            </div>

            <TableContainer className="table-container-fill">
              <table>
                <thead>
                  <tr>
                    <th>Fixture Name</th>
                    <th>Part Name</th>
                    <th>Article Number</th>
                    <th>Make</th>
                    <th>Shortage Qty</th>
                    <th>Lead Days</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        Loading shortage items...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        No shortage items found
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => {
                      const missingInStockMaintenance = isMissingInStockMaintenance(row);

                      return (
                        <tr
                          key={`${row.product_details}-${row.part_name}-${row.article_number}-${row.make}-${index}`}
                          style={missingInStockMaintenance ? shortageStyles.missingRow : undefined}
                        >
                          <td>{row.product_details || "-"}</td>
                          <td>
                            <div
                              style={missingInStockMaintenance ? shortageStyles.missingPartName : undefined}
                            >
                              {row.part_name || "-"}
                            </div>
                            {missingInStockMaintenance ? (
                              <div style={shortageStyles.missingCaption}>Not in Stock Maintenance</div>
                            ) : null}
                          </td>
                          <td>{row.article_number || "-"}</td>
                          <td>{row.make || "-"}</td>
                          <td className="text-danger fw-800">{row.shortage_qty}</td>
                          <td>{formatLeadDays(row.lead_days)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </TableContainer>
          </>
        )}

        {activeTab === "lowstock" && (
          <>
            <div className="filters-bar">
              <div className="form-field" style={shortageStyles.searchField}>
                <label className="form-label">Search</label>
                <div style={shortageStyles.searchBar}>
                  <input
                    type="text"
                    className="form-control form-control-inline"
                    placeholder="Search by part name, article number, make, or type 'shortage'"
                    value={lowStockSearchInput}
                    onChange={(event) => setLowStockSearchInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleLowStockSearch();
                      }
                    }}
                    style={shortageStyles.searchInput}
                  />
                  <button
                    type="button"
                    style={shortageStyles.searchButton}
                    onClick={handleLowStockSearch}
                    aria-label="Search low stock materials"
                    title="Search low stock materials"
                  >
                    <Search size={15} />
                  </button>
                </div>
              </div>

              <FormInput
                as="select"
                label="Make"
                value={selectedLowStockMake}
                onChange={(event) => setSelectedLowStockMake(event.target.value)}
              >
                <option value="">All Makes</option>
                {lowStockMakeOptions.map((make) => (
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </FormInput>

              <div className="filters-actions" style={shortageStyles.actionGroup}>
                <PrimaryButton type="button" onClick={handleLowStockApply}>
                  Apply Filter
                </PrimaryButton>
                <SecondaryButton type="button" onClick={handleLowStockClear}>
                  Clear
                </SecondaryButton>
                <button
                  type="button"
                  style={shortageStyles.exportButton}
                  onClick={handleLowStockExport}
                  title="Export low stock materials to Excel"
                >
                  <Download size={15} />
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>Export</span>
                </button>
                {/* <SecondaryButton type="button" onClick={fetchLowStock}>
                  Refresh
                </SecondaryButton> */}
              </div>
            </div>

            {lowStockError && <div className="form-error">{lowStockError}</div>}

            <TableContainer className="table-container-fill">
              <table>
                <thead>
                  <tr>
                    <th>Part Name</th>
                    <th>Article No.</th>
                    <th>Make</th>
                    <th>Current Qty</th>
                    <th>Min Stock</th>
                    <th>Lead Days</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockLoading ? (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        Loading low stock materials...
                      </td>
                    </tr>
                  ) : filteredLowStockRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        {lowStockRows.length === 0
                          ? "No low stock materials found"
                          : "No matching records found"}
                      </td>
                    </tr>
                  ) : (
                    filteredLowStockRows.map((row, index) => (
                      <tr
                        key={`${row.article_number}-${row.make}-${index}`}
                        style={getLowStockCurrentQty(row) <= 0 ? { backgroundColor: "#fee2e2" } : undefined}
                      >
                        <td>{row.part_name || "-"}</td>
                        <td>{row.article_number || "-"}</td>
                        <td>{row.make || "-"}</td>
                        <td className={getLowStockCurrentQty(row) <= 0 ? "text-danger fw-800" : ""}>
                          {getLowStockCurrentQty(row)}
                        </td>
                        <td>{row.minimum_stock}</td>
                        <td>{formatLeadDays(row.lead_days)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableContainer>
          </>
        )}
      </div>
    </div>
  );
}

const tabStyles = {
  tabRow: {
    display: "flex",
    gap: "4px",
    marginBottom: "12px",
    borderBottom: "2px solid #e2e8f0",
    paddingBottom: "0",
  },
  tab: {
    padding: "8px 20px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    background: "none",
    color: "#64748b",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    marginBottom: "-2px",
    transition: "color 0.15s, border-color 0.15s",
  },
  tabActive: {
    padding: "8px 20px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    background: "none",
    color: "#7c3aed",
    cursor: "pointer",
    borderBottom: "2px solid #7c3aed",
    marginBottom: "-2px",
    transition: "color 0.15s, border-color 0.15s",
  },
};

const shortageStyles = {
  searchField: {
    flex: 1.4,
    minWidth: "320px",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
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
  },
  actionGroup: {
    marginLeft: "auto",
    flexWrap: "wrap",
  },
  legend: {
    marginBottom: "12px",
    padding: "10px 12px",
    borderRadius: "10px",
    backgroundColor: "#fff7ed",
    color: "#9a3412",
    fontSize: "13px",
    fontWeight: 600,
  },
  missingRow: {
    backgroundColor: "#fff7ed",
  },
  missingPartName: {
    color: "#9a3412",
    fontWeight: 700,
  },
  missingCaption: {
    marginTop: "2px",
    color: "#c2410c",
    fontSize: "12px",
    fontWeight: 600,
  },
};
