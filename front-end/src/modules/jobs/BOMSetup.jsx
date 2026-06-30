import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Card from "../../components/ui/Card";
import TableContainer from "../../components/ui/TableContainer";
import StatusBadge from "../../components/ui/StatusBadge";
import { HelpCircle, Search } from "lucide-react";

const BOMSetup = () => {
  const [fixtures, setFixtures] = useState([]);
  const [selectedFixture, setSelectedFixture] = useState(null);
  const [fixtureDetails, setFixtureDetails] = useState(null);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchFixtures = async () => {
    try {
      setLoadingFixtures(true);
      setError("");
      const res = await axios.get("http://localhost:8000/fixture-bom/list");
      setFixtures(Array.isArray(res.data) ? res.data : []);
    } catch (fetchError) {
      console.error("Error fetching fixtures:", fetchError);
      setError("Failed to load fixtures");
    } finally {
      setLoadingFixtures(false);
    }
  };

  const fetchFixtureDetails = async (productDetails) => {
    if (!productDetails) return;

    try {
      setLoadingDetails(true);
      setError("");
      const res = await axios.get(
        `http://localhost:8000/fixture-bom/details/${encodeURIComponent(productDetails)}`
      );
      setFixtureDetails(res.data);
    } catch (fetchError) {
      console.error("Error fetching fixture BOM details:", fetchError);
      setFixtureDetails(null);
      setError("Failed to load fixture BOM details");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchFixtures();
  }, []);

  useEffect(() => {
    if (!fixtures.length) {
      setSelectedFixture(null);
      setFixtureDetails(null);
      return;
    }

    const matchingSelected = fixtures.find(
      (fixture) => fixture.product_details === selectedFixture?.product_details
    );

    if (!matchingSelected) {
      setSelectedFixture(fixtures[0]);
    } else {
      setSelectedFixture(matchingSelected);
    }
  }, [fixtures, selectedFixture]);

  useEffect(() => {
    if (selectedFixture?.product_details) {
      fetchFixtureDetails(selectedFixture.product_details);
    } else {
      setFixtureDetails(null);
    }
  }, [selectedFixture]);

  const filteredFixtures = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return fixtures;

    return fixtures.filter((fixture) => {
      const productDetails = String(fixture.product_details || "").toLowerCase();
      const status = String(fixture.status || "").toLowerCase();
      return productDetails.includes(query) || status.includes(query);
    });
  }, [fixtures, searchQuery]);

  useEffect(() => {
    if (!filteredFixtures.length) {
      setSelectedFixture(null);
      setFixtureDetails(null);
      return;
    }

    const stillVisible = filteredFixtures.find(
      (fixture) => fixture.product_details === selectedFixture?.product_details
    );

    if (!stillVisible) {
      setSelectedFixture(filteredFixtures[0]);
    }
  }, [filteredFixtures, selectedFixture]);

  const handleSearch = () => {
    setSearchQuery(searchInput);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  };

  const handleHelpClick = () => {
    window.location.href = "/help#jobs-bom-setup";
  };

  return (
    <div className="module-page scroll-auto">
      <div style={styles.header}>
        <div style={styles.titleContainer}>
          <h3 className="section-title" style={styles.title}>Fixture BOM Browser</h3>
          <button
            onClick={handleHelpClick}
            style={styles.helpIconButton}
            className="help-icon-btn"
            title="Browse fixture list, check their status, and view the selected fixture BOM on the right."
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div style={styles.browserGrid}>
        <Card className="panel">
          <div style={styles.panelHeader}>
            <div>
              <h4 className="section-title small">Fixtures</h4>
              <p style={styles.panelSubtext}>
                {loadingFixtures ? "Loading fixture list..." : `${filteredFixtures.length} fixtures shown`}
              </p>
            </div>

            <div style={styles.searchBar}>
              <input
                type="text"
                className="form-control form-control-inline"
                style={styles.searchInput}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search fixture"
              />
              <button
                type="button"
                style={styles.searchButton}
                onClick={handleSearch}
                aria-label="Search fixtures"
                title="Search fixtures"
              >
                <Search size={15} />
              </button>
            </div>
          </div>

          <TableContainer className="table-container-fill">
            <table>
              <thead>
                <tr>
                  <th>Fixture</th>
                  <th>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingFixtures ? (
                  <tr>
                    <td colSpan="3" className="table-empty">Loading fixtures...</td>
                  </tr>
                ) : filteredFixtures.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="table-empty">No fixtures found.</td>
                  </tr>
                ) : (
                  filteredFixtures.map((fixture, index) => {
                    const isSelected =
                      selectedFixture?.product_details === fixture.product_details;

                    return (
                      <tr
                        key={`${fixture.product_details}-${index}`}
                        onClick={() => setSelectedFixture(fixture)}
                        style={isSelected ? styles.selectedRow : styles.clickableRow}
                      >
                        <td style={styles.fixtureNameCell}>{fixture.product_details}</td>
                        <td>{fixture.fixture_qty ?? "-"}</td>
                        <td>
                          <StatusBadge status={fixture.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableContainer>
        </Card>

        <Card className="panel">
          {!selectedFixture ? (
            <div className="empty-state">
              <p className="text-secondary fw-600">Select a fixture to view its BOM</p>
            </div>
          ) : (
            <>
              <div style={styles.detailsHeader}>
                <div>
                  <h4 className="section-title small" style={{ marginBottom: "8px" }}>
                    {selectedFixture.product_details}
                  </h4>
                  <div style={styles.metaRow}>
                    <span style={styles.metaText}>Fixture Qty: {selectedFixture.fixture_qty ?? "-"}</span>
                    <StatusBadge status={selectedFixture.status} />
                  </div>
                  {selectedFixture.created_at && (
                    <p style={styles.createdText}>Created: {selectedFixture.created_at}</p>
                  )}
                </div>
              </div>

              <TableContainer className="table-container-fill">
                <table>
                  <thead>
                    <tr>
                      <th>Part Name</th>
                      <th>Article No</th>
                      <th>Make</th>
                      <th>Req. Qty/Unit</th>
                      <th>Total Req. Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingDetails ? (
                      <tr>
                        <td colSpan="5" className="table-empty">Loading BOM details...</td>
                      </tr>
                    ) : !fixtureDetails?.materials?.length ? (
                      <tr>
                        <td colSpan="5" className="table-empty">No BOM materials found.</td>
                      </tr>
                    ) : (
                      fixtureDetails.materials.map((item, index) => {
                        const fixtureQty = Number(
                          fixtureDetails.fixture_qty ?? selectedFixture?.fixture_qty ?? 0
                        );
                        const totalRequiredQty = Number(item.required_qty ?? 0);
                        // Calculate per-unit quantity by dividing total by fixture qty
                        const perUnitQty = Number.isFinite(fixtureQty) && fixtureQty > 0 
                          ? totalRequiredQty / fixtureQty 
                          : "-";

                        return (
                          <tr key={`${item.bo_part_name}-${item.article_number}-${index}`}>
                            <td>{item.bo_part_name || "-"}</td>
                            <td>{item.article_number || "-"}</td>
                            <td>{item.make || "-"}</td>
                            <td>{Number.isFinite(perUnitQty) ? perUnitQty : "-"}</td>
                            <td>{Number.isFinite(totalRequiredQty) ? totalRequiredQty : "-"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </TableContainer>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

const styles = {
  header: {
    marginBottom: "20px",
  },
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  title: {
    margin: 0,
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
  browserGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.55fr)",
    gap: "16px",
    alignItems: "stretch",
    minHeight: 0,
    flex: 1,
  },
  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    padding: "8px 0 12px",
    flexWrap: "wrap",
  },
  panelSubtext: {
    margin: "6px 0 0",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 600,
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: "220px",
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
  clickableRow: {
    cursor: "pointer",
  },
  selectedRow: {
    cursor: "pointer",
    backgroundColor: "#f5f3ff",
  },
  fixtureNameCell: {
    fontWeight: 700,
    color: "#1f2937",
  },
  detailsHeader: {
    padding: "8px 0 14px",
    borderBottom: "1px solid #e5e7eb",
    marginBottom: "4px",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  metaText: {
    color: "#374151",
    fontSize: "13px",
    fontWeight: 600,
  },
  createdText: {
    margin: "10px 0 0",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 600,
  },
};

export default BOMSetup;
