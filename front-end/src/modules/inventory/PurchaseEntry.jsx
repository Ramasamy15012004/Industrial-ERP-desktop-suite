import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import Card from "../../components/ui/Card";
import SecondaryButton from "../../components/ui/SecondaryButton";
import PrimaryButton from "../../components/ui/PrimaryButton";
import StatusBadge from "../../components/ui/StatusBadge";
import TableContainer from "../../components/ui/TableContainer";
import { HelpCircle, UploadCloud, FileText, X, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { getUserRole } from "../../api/auth";

const PurchaseEntry = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [issueJobs, setIssueJobs] = useState([]);
  const [jobDetails, setJobDetails] = useState(null);
  const [reservedFixtures, setReservedFixtures] = useState([]);
  const [fixtureDetails, setFixtureDetails] = useState(null);
  const [fixtureModalOpen, setFixtureModalOpen] = useState(false);
  const [issueConfirmFixture, setIssueConfirmFixture] = useState(null);
  const [issuingFixture, setIssuingFixture] = useState(false);
  const [message, setMessage] = useState("");
  const role = getUserRole();
  const isAudit = role === "audit";

  // Upload states
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const fileInputRef = useRef(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmReviewOpen, setConfirmReviewOpen] = useState(false);
  const [similarData, setSimilarData] = useState({});
  const [popupFor, setPopupFor] = useState(null);
  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [newMaterialDraft, setNewMaterialDraft] = useState({
    part_name: "",
    article_number: "",
    make: "",
    qty: "",
    minimum_stock: "",
    lead_days: "",
    price: "",
  });
  const inputRefs = useRef([]);

  // Column visibility states
  const [hasPriceData, setHasPriceData] = useState(false);
  const [hasLeadDaysData, setHasLeadDaysData] = useState(false);

  const fetchReservedJobs = () => {
    axios.get("http://localhost:8000/active-jobs").then((res) => {
      setIssueJobs(res.data.filter((j) => j.status === "Reserved"));
    });
  };

  const isDifferent = (a, b) => {
    const norm = (v) => {
      if (v === null || v === undefined || v === "") return "";
      if (!isNaN(v)) return Number(v); // handle numbers correctly
      return String(v).trim().toLowerCase();
    };
    return norm(a) !== norm(b);
  };
  const fetchReservedFixtures = () => {
    axios.get("http://localhost:8000/fixture-bom/list")
      .then((res) => {
        setReservedFixtures(res.data.filter((fixture) => fixture.status === "Reserved"));
      })
      .catch((err) => console.error("Error fetching reserved fixtures:", err));
  };

  useEffect(() => {
    axios.get("http://localhost:8000/materials")
      .then((res) => setMaterials(res.data))
      .catch((err) => console.error(err));
    fetchReservedJobs();
    fetchReservedFixtures();
  }, []);

  const handleIssue = async (jobId) => {
    try {
      const res = await axios.post("http://localhost:8000/issue-material", { job_id: jobId });
      setMessage(res.data.message);
      fetchReservedJobs();
      setJobDetails(null);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Error issuing material");
    }
  };

  const handleJobSelect = async (jobId) => {
    try {
      const res = await axios.get(`http://localhost:8000/job-issue-details/${jobId}`);
      setJobDetails(res.data);
    } catch {
      setMessage("Unable to fetch job details");
    }
  };

  const handleFixtureView = async (productDetails) => {
    try {
      const res = await axios.get(`http://localhost:8000/fixture-bom/details/${encodeURIComponent(productDetails)}`);
      setFixtureDetails(res.data);
      setFixtureModalOpen(true);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to fetch fixture BOM details");
    }
  };

  const handleFixtureIssue = async () => {
    if (!issueConfirmFixture) return;

    try {
      setIssuingFixture(true);
      const res = await axios.post(`http://localhost:8000/fixture-bom/issue/${encodeURIComponent(issueConfirmFixture.product_details)}`);
      setMessage(res.data.message);
      setIssueConfirmFixture(null);
      setFixtureModalOpen(false);
      setFixtureDetails(null);
      fetchReservedFixtures();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Error issuing fixture material");
    } finally {
      setIssuingFixture(false);
    }
  };

  const handleHelpClick = (section) => navigate(`/help#${section}`);

  const handleFile = (selectedFile) => {
    if (!selectedFile) return;
    const allowedExt = [".csv", ".xlsx", ".xls"];
    const fileExt = selectedFile.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
    if (!allowedExt.includes(fileExt)) {
      setErrorMsg("Only .csv, .xlsx or .xls files are allowed");
      setUploadStatus("error");
      return;
    }
    const nameWithoutExt = selectedFile.name.replace(/\.[^.]+$/, "");
    if (!nameWithoutExt.toUpperCase().endsWith("PURCHASE")) {
      setErrorMsg("File name must end with 'PURCHASE'. Example: Stock_PURCHASE.xlsx");
      setUploadStatus("error");
      return;
    }
    setFile(selectedFile);
    setUploadStatus(null);
    setErrorMsg("");
    setResultMsg("");
  };

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleBrowse = () => fileInputRef.current.click();
  const handleRemoveFile = () => {
    setFile(null); setUploadStatus(null);
    setErrorMsg(""); setResultMsg("");
    fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const fileExt = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();
      const token = localStorage.getItem("authToken");
      const formData = new FormData();

      if (fileExt === ".xls") {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        if (rows.length === 0) {
          setErrorMsg("Excel file is empty");
          setUploadStatus("error");
          setUploading(false);
          return;
        }
        formData.append("rows_json", JSON.stringify(rows));
      } else {
        formData.append("file", file);
      }

      const res = await axios.post(
        "http://localhost:8000/upload-stock-maintenance/preview",
        formData,
        { headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` } }
      );
      const previewData = res.data;

      setPreviewRows(previewData);
      setShowPreview(true);

      // Check which columns have data to determine visibility
      const hasPrice = previewData.some((row) => row.price_from_file);
      const hasLeadDays = previewData.some((row) => String(row.lead_days || "").trim() !== "");
      setHasPriceData(hasPrice);
      setHasLeadDaysData(hasLeadDays);

      // Auto-fetch similar for all rows with article number
      const similarMap = {};
      await Promise.all(
        previewData.map(async (r, i) => {
          if (!r.article_number || !r.has_similar) return;
          const params = new URLSearchParams();
          if (r.part_name) params.append("part_name", r.part_name);
          if (r.article_number) params.append("article_number", r.article_number);
          if (r.make) params.append("make", r.make);
          try {
            const res = await axios.get(
              `http://localhost:8000/stock-maintenance/similar?${params.toString()}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (res.data.length > 0) similarMap[i] = res.data;
          } catch { /* ignore */ }
        })
      );
      setSimilarData(similarMap);

    } catch (error) {
      setErrorMsg(error.response?.data?.detail || "Upload failed.");
      setUploadStatus("error");
    } finally {
      setUploading(false);
    }
  };

  const handleCancelPreview = () => {
    setShowPreview(false);
    setPreviewRows([]);
    setFile(null);
    setSimilarData({});
    setPopupFor(null);
    setShowAddMaterialForm(false);
    setNewMaterialDraft({
      part_name: "",
      article_number: "",
      make: "",
      qty: "",
      minimum_stock: "",
      lead_days: "",
      price: "",
    });
    setConfirmReviewOpen(false);
    setUploadStatus(null);
    setErrorMsg("");
    setResultMsg("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validatePreviewRows = () => {
    const unresolvedSimilarRows = previewRows.filter((_, index) => similarData[index]);
    if (unresolvedSimilarRows.length > 0) {
      setErrorMsg(`Resolve similar article rows before saving: ${unresolvedSimilarRows.map((row) => row.article_number).join(', ')}`);
      setUploadStatus("error");
      return false;
    }

    const invalidManualRows = previewRows.filter((row) =>
      row.manual_entry && (
        !String(row.part_name || "").trim()
        || !String(row.article_number || "").trim()
        || !Number.isInteger(Number(row.qty)) 
        || Number(row.qty) < 0
      )
    );
    if (invalidManualRows.length > 0) {
      setErrorMsg("Each added material needs part name, article number, and qty 0 or more.");
      setUploadStatus("error");
      return false;
    }

    const invalidMinStockRows = previewRows.filter((row) => {
      const minimumStock = Number(row.minimum_stock);
      return Number.isNaN(minimumStock) || minimumStock < 0 || !Number.isInteger(minimumStock);
    });
    if (invalidMinStockRows.length > 0) {
      setErrorMsg(`Minimum stock must be a whole number 0 or more. Update: ${invalidMinStockRows.map(r => r.part_name || r.article_number).join(', ')}`);
      setUploadStatus("error");
      return false;
    }

    const invalidLeadDays = previewRows.filter((row) => {
      const raw = String(row.lead_days || "").trim();
      return raw !== "" && !/^\d+[dw]$/i.test(raw);
    });
    if (invalidLeadDays.length > 0) {
      setErrorMsg(`Lead days must use d for days or w for weeks. Update: ${invalidLeadDays.map(r => r.article_number).join(', ')}`);
      setUploadStatus("error");
      return false;
    }

    setErrorMsg("");
    setUploadStatus(null);
    return true;
  };

  const handleConfirm = async () => {
    if (!validatePreviewRows()) return;
    setConfirmReviewOpen(true);
  };

  const handleFinalConfirmSave = async () => {
    try {
      setConfirming(true);
      const payload = previewRows.map((r) => ({
        part_name: r.part_name,
        article_number: r.article_number,
        make: r.make,
        qty: r.qty,
        is_new: r.is_new,
        minimum_stock: r.minimum_stock,
        lead_days: r.lead_days,
        price: r.price,
      }));
      const token = localStorage.getItem("authToken");
      const res = await axios.post(
        "http://localhost:8000/upload-stock-maintenance/confirm",
        { rows: payload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResultMsg(res.data.message);
      setUploadStatus("success");
      setConfirmReviewOpen(false);
      setShowPreview(false);
      setPreviewRows([]);
      setFile(null);
      setSimilarData({});
      setPopupFor(null);
      setShowAddMaterialForm(false);
      setNewMaterialDraft({
        part_name: "",
        article_number: "",
        make: "",
        qty: "",
        minimum_stock: "",
        lead_days: "",
        price: "",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setErrorMsg(error.response?.data?.detail || "Save failed.");
      setUploadStatus("error");
    } finally {
      setConfirming(false);
    }
  };

  const handleUpdatePreviewRow = (index, field, value) => {
    const updatedRows = [...previewRows];
    updatedRows[index] = { ...updatedRows[index], [field]: value };
    setPreviewRows(updatedRows);
  };

  const resetNewMaterialDraft = () => {
    setNewMaterialDraft({
      part_name: "",
      article_number: "",
      make: "",
      qty: "",
      minimum_stock: "",
      lead_days: "",
      price: "",
    });
  };

  const handleNewMaterialDraftChange = (field, value) => {
    setNewMaterialDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddMaterialRow = async () => {
    const articleNumber = String(newMaterialDraft.article_number || "").trim();
    const partName = String(newMaterialDraft.part_name || "").trim();
    const make = String(newMaterialDraft.make || "").trim();
    let leadDays = String(newMaterialDraft.lead_days || "").trim().toLowerCase();
    // auto convert "12" → "12d"
    if (/^\d+$/.test(leadDays)) { leadDays = `${leadDays}d`; }
    const qty = parseInt(newMaterialDraft.qty || "0", 10);
    const minimumStock = parseInt(newMaterialDraft.minimum_stock || "0", 10);
    const price = parseFloat(newMaterialDraft.price || "0");
    

    if (!articleNumber) {
      setErrorMsg("Article number is required for a new material.");
      setUploadStatus("error");
      return;
    }
    if (!partName) {
      setErrorMsg("Part name is required for a new material.");
      setUploadStatus("error");
      return;
    }
    if (!Number.isInteger(qty) || qty < 0) {
      setErrorMsg("Qty cannot be negative for a new material.");
      setUploadStatus("error");
      return;
    }
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      setErrorMsg("Minimum stock must be a whole number 0 or more.");
      setUploadStatus("error");
      return;
    }
    if (leadDays !== "" && !/^\d+[dw]$/i.test(leadDays)) {
      setErrorMsg("Lead days must use d for days or w for weeks.");
      setUploadStatus("error");
      return;
    }

    const newRow = {
      part_name: partName,
      article_number: articleNumber,
      make,
      qty,
      is_new: true,
      current_qty: 0,
      minimum_stock: Number.isFinite(minimumStock) ? minimumStock : 0,
      lead_days: leadDays,
      price: Number.isFinite(price) ? price : 0,
      price_from_file: Number.isFinite(price) && price > 0,
      has_similar: false,
      db_snapshot: null,
      manual_entry: true,
    };

    const nextIndex = previewRows.length;
    const token = localStorage.getItem("authToken");
    let matchedSimilar = null;

    try {
      const params = new URLSearchParams();
      if (partName) params.append("part_name", partName);
      params.append("article_number", articleNumber);
      if (make) params.append("make", make);
      const res = await axios.get(
        `http://localhost:8000/stock-maintenance/similar?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (Array.isArray(res.data) && res.data.length > 0) {
        matchedSimilar = res.data;
        newRow.has_similar = true;
      }
    } catch {
      // Keep manual add working even if similar lookup fails.
    }

    setShowPreview(true);
    setPreviewRows((prev) => [...prev, newRow]);
    if (matchedSimilar) {
      setSimilarData((prev) => ({ ...prev, [nextIndex]: matchedSimilar }));
    }
    if (leadDays) setHasLeadDaysData(true);
    if (Number.isFinite(price) && price > 0) setHasPriceData(true);
    setErrorMsg("");
    setUploadStatus(null);
    setShowAddMaterialForm(false);
    resetNewMaterialDraft();
  };

  const handleSelectSimilar = (rowIndex, similar) => {
    setPreviewRows(prev => prev.map((row, idx) =>
      idx === rowIndex ? {
        ...row,
        part_name: similar.part_name,
        article_number: similar.article_number,
        make: similar.make,
        is_new: false,
        minimum_stock: similar.minimum_stock || 0,
        lead_days: similar.lead_days || "",
        price: similar.price || 0,
        current_qty: similar.qty,
        db_snapshot: JSON.parse(JSON.stringify({
          part_name: similar.part_name || "",
          article_number: similar.article_number || "",
          make: similar.make || "",
          qty: similar.qty || 0,
          minimum_stock: similar.minimum_stock || 0,
          lead_days: similar.lead_days || "",
          price: similar.price || 0,
        }))
      } : row
    ));
    setSimilarData(prev => {
      const updated = { ...prev };
      delete updated[rowIndex];
      return updated;
    });
    setPopupFor(null);
  };

  const handleSelectSimilarForUpdate = (rowIndex, similar) => {
    setPreviewRows((prev) =>
      prev.map((row, idx) =>
        idx === rowIndex
          ? {
              ...row,
              is_new: false,
              current_qty: similar.qty || 0,
              db_snapshot: JSON.parse(JSON.stringify({
                part_name: similar.part_name || "",
                article_number: similar.article_number || "",
                make: similar.make || "",
                qty: similar.qty || 0,
                minimum_stock: similar.minimum_stock || 0,
                lead_days: similar.lead_days || "",
                price: similar.price || 0,
              })),
            }
          : row
      )
    );
    setSimilarData((prev) => {
      const updated = { ...prev };
      delete updated[rowIndex];
      return updated;
    });
    setPopupFor(null);
  };

  const getRowChanges = (row) => {
  const original = row.db_snapshot || {};
  const changes = [];

    if ((row.part_name || "") !== (original.part_name || "")) {
      changes.push(`Part Name: ${original.part_name || "-"} -> ${row.part_name || "-"}`);
    }

    if ((row.make || "") !== (original.make || "")) {
      changes.push(`Make: ${original.make || "-"} -> ${row.make || "-"}`);
    }

    if (Number(row.minimum_stock || 0) !== Number(original.minimum_stock || 0)) {
      changes.push(`Min Qty: ${original.minimum_stock || 0} -> ${row.minimum_stock || 0}`);
    }

    if ((String(row.lead_days || "")) !== (String(original.lead_days || ""))) {
      changes.push(`Lead Days: ${original.lead_days || "-"} -> ${row.lead_days || "-"}`);
    }

    if (Number(row.price || 0) !== Number(original.price || 0)) {
      changes.push(`Price: ${original.price || 0} -> ${row.price || 0}`);
    }

    return changes;
  };

  const reviewChanges = previewRows
    .map((row, index) => ({
      row,
      index,
      changes: getRowChanges(row),
    }))
    .filter(({ changes }) => changes.length > 0);

  return (
    <div className="module-page scroll-auto">
      <div className="purchase-grid">

        {/* LEFT — Purchase Entry Upload Card */}
        <Card>
          <div style={styles.titleContainer}>
            <h3 className="section-title">Purchase Entry</h3>
            <button
              onClick={() => handleHelpClick("inventory-inward")}
              style={styles.helpIconButton}
              className="help-icon-btn"
              title="Upload stock maintenance file"
            >
              <HelpCircle size={18} />
            </button>
          </div>

          {!isAudit && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
              <button
                type="button"
                onClick={() => {
                  setShowAddMaterialForm(true);
                  setErrorMsg("");
                  setUploadStatus(null);
                }}
                style={styles.addButton}
              >
                Add Material
              </button>
            </div>
          )}

          {/* Preview table */}
          {showPreview && (
            <div style={{ marginTop: "4px" }}>
              <p style={{ fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "10px" }}>
                Review before saving — data from uploaded file:
              </p>
              {/* <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMaterialForm(true);
                    setErrorMsg("");
                    setUploadStatus(null);
                  }}
                  style={styles.addButton}
                >
                  Add Material
                </button>
              </div> */}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#7c3aed", color: "#fff" }}>
                      <th style={{ padding: "8px", textAlign: "left" }}>Part Name</th>
                      <th style={{ padding: "8px" }}>Article No.</th>
                      <th style={{ padding: "8px" }}>Make</th>
                      <th style={{ padding: "8px" }}>Qty</th>
                      <th style={{ padding: "8px" }}>Min Stock</th>
                      {hasLeadDaysData && <th style={{ padding: "8px" }}>Lead Days</th>}
                      {hasPriceData && <th style={{ padding: "8px" }}>Price</th>}
                      <th style={{ padding: "8px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f5f3ff" }}>

                        <td style={{ padding: "6px 8px" }}>
                          {row.manual_entry ? (
                            <input
                              type="text"
                              value={row.part_name || ""}
                              onChange={(e) => handleUpdatePreviewRow(i, "part_name", e.target.value)}
                              style={styles.compactInput}
                              placeholder="Part Name"
                            />
                          ) : (row.part_name || "-")}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {row.manual_entry ? (
                            <input
                              type="text"
                              value={row.article_number || ""}
                              onChange={(e) => handleUpdatePreviewRow(i, "article_number", e.target.value)}
                              style={styles.compactInput}
                              placeholder="Article No."
                            />
                          ) : row.article_number}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {row.manual_entry ? (
                            <input
                              type="text"
                              value={row.make || ""}
                              onChange={(e) => handleUpdatePreviewRow(i, "make", e.target.value)}
                              style={styles.compactInput}
                              placeholder="Make"
                            />
                          ) : (row.make || "-")}
                        </td>

                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {row.manual_entry ? (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.qty || ""}
                              onChange={(e) => handleUpdatePreviewRow(i,"qty", parseInt(e.target.value || "0", 10) )}
                              style={styles.compactInput}
                              placeholder="Qty"
                            />
                          ) : row.qty}
                        </td>

                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.minimum_stock || ""}
                            onChange={(e) => handleUpdatePreviewRow(i, "minimum_stock", parseInt(e.target.value || "0", 10) || 0)}
                            style={{
                              width: "60px",
                              padding: "2px 4px",
                              border: "1px solid #d1d5db",
                              borderRadius: "4px",
                              textAlign: "center",
                              fontSize: "12px"
                            }}
                            placeholder="0"
                          />
                        </td>
                        {hasLeadDaysData && (
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <input
                              type="text"
                              value={row.lead_days || ""}
                              onChange={(e) => {
                                const value = e.target.value.trim().toLowerCase();
                                if (value === "" || /^\d*[dw]?$/i.test(value)) {
                                  handleUpdatePreviewRow(i, "lead_days", value);
                                }
                              }}
                              style={{
                                width: "60px",
                                padding: "2px 4px",
                                border: "1px solid #d1d5db",
                                borderRadius: "4px",
                                textAlign: "center",
                                fontSize: "12px"
                              }}
                              placeholder="5d / 2w"
                            />
                          </td>
                        )}
                        {hasPriceData && (
                          <td style={{ padding: "6px 8px", textAlign: "center" }}>
                            <input
                              type="number"
                              step="0.01"
                              value={row.price || ""}
                              onChange={(e) => handleUpdatePreviewRow(i, "price", parseFloat(e.target.value) || 0)}
                              style={{
                                width: "70px",
                                padding: "2px 4px",
                                border: "1px solid #d1d5db",
                                borderRadius: "4px",
                                textAlign: "center",
                                fontSize: "12px"
                              }}
                              placeholder="0.00"
                            />
                          </td>
                        )}

                        {/* Status column */}
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          {similarData[i] ? (
                            <button
                              onClick={() => setPopupFor(popupFor === i ? null : i)}
                              style={{
                                padding: "2px 10px", borderRadius: "12px", fontSize: "11px",
                                backgroundColor: popupFor === i ? "#7c3aed" : "#fef9c3",
                                color: popupFor === i ? "#fff" : "#854d0e",
                                border: `1px solid ${popupFor === i ? "#7c3aed" : "#fde047"}`,
                                cursor: "pointer", fontWeight: "500",
                              }}
                            >
                              {popupFor === i ? "Close" : "Similar"}
                            </button>
                          ) : row.is_new ? (
                            <span style={{
                              padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
                              backgroundColor: "#dcfce7", color: "#166534",
                              border: "1px solid #86efac",
                            }}>New</span>
                          ) : (
                            <span style={{
                              padding: "2px 8px", borderRadius: "12px", fontSize: "11px",
                              backgroundColor: "#ede9fe", color: "#5b21b6",
                            }}>
                              {`Existing (${row.current_qty})`}
                            </span>
                          )}
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Similar Popup Modal */}
              {popupFor !== null && similarData[popupFor] && (
                <div className="blur-overlay" style={{
                  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: "rgba(0,0,0,0.4)", zIndex: 1000,
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <div style={{
                    backgroundColor: "#fff", borderRadius: "12px", padding: "20px",
                    width: "92%", maxWidth: "760px",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#374151" }}>
                        Similar parts found
                      </h4>
                      <button
                        onClick={() => setPopupFor(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "20px", lineHeight: 1 }}
                      >×</button>
                    </div>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#7c3aed", color: "#fff" }}>
                          <th style={{ padding: "7px 8px", textAlign: "left" }}>Part Name</th>
                          <th style={{ padding: "7px 8px" }}>Article No.</th>
                          <th style={{ padding: "7px 8px" }}>Make</th>
                          <th style={{ padding: "7px 8px" }}>Qty</th>
                          <th style={{ padding: "7px 8px" }}>Min Stock</th>
                          <th style={{ padding: "7px 8px" }}>Lead Days</th>
                          <th style={{ padding: "7px 8px" }}>Price</th>
                          <th style={{ padding: "7px 8px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {similarData[popupFor].map((r, idx) => {
                          const row = previewRows[popupFor];

                          return (
                            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#f5f3ff" }}>

                              <td style={{
                                padding: "6px 8px",
                                backgroundColor: isDifferent(row.part_name, r.part_name) ? "#fee2e2" : ""
                              }}>
                                {r.part_name}
                              </td>

                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                {r.article_number}
                              </td>

                              <td style={{
                                padding: "6px 8px",
                                textAlign: "center",
                                backgroundColor: isDifferent(row.make, r.make) ? "#fee2e2" : ""
                              }}>
                                {r.make}
                              </td>

                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                {r.qty}
                              </td>

                              <td style={{
                                padding: "6px 8px",
                                textAlign: "center",
                                backgroundColor: isDifferent(row.minimum_stock, r.minimum_stock) ? "#fee2e2" : ""
                              }}>
                                {r.minimum_stock}
                              </td>

                              <td style={{
                                padding: "6px 8px",
                                textAlign: "center",
                                backgroundColor: isDifferent(row.lead_days, r.lead_days) ? "#fee2e2" : ""
                              }}>
                                {r.lead_days || "-"}
                              </td>

                              <td style={{
                                padding: "6px 8px",
                                textAlign: "center",
                                backgroundColor: isDifferent(row.price, r.price) ? "#fee2e2" : ""
                              }}>
                                {Number(r.price || 0).toFixed(2)}
                              </td>

                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                {!isAudit && (
                                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                    <SecondaryButton type="button" className="btn-sm" onClick={() => handleSelectSimilar(popupFor, r)} > Use </SecondaryButton>
                                    <PrimaryButton type="button" className="btn-sm" onClick={() => handleSelectSimilarForUpdate(popupFor, r)}> Update </PrimaryButton>
                                  </div>
                                )}
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
                      <button
                        onClick={() => setPopupFor(null)}
                        style={{
                          padding: "8px 14px",
                          backgroundColor: "transparent",
                          color: "#6b7280",
                          border: "1px solid #d1d5db",
                          borderRadius: "8px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontWeight: "500"
                        }}
                      >
                        Close
                      </button>
                    </div>
                    <p style={{ margin: "12px 0 0", fontSize: "11px", color: "#9ca3af", textAlign: "center" }}>
                      Choose Use to copy the selected DB row into this upload row, or Update to keep the upload values and update against the selected DB row
                    </p>
                  </div>
                </div>
              )}

              {uploadStatus === "error" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginTop: "12px", color: "#991b1b", fontSize: "13px" }}>
                  ⚠ {errorMsg}
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                {!isAudit && (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    style={{ flex: 1, padding: "10px", backgroundColor: confirming ? "#a78bfa" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "500", cursor: confirming ? "not-allowed" : "pointer" }}
                  >
                    {confirming ? "Saving..." : "Confirm & Save"}
                  </button>
                )}
                <button
                  onClick={handleCancelPreview}
                  style={{ padding: "10px 20px", backgroundColor: "transparent", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "14px", cursor: "pointer", color: "#6b7280" }}
                >
                  {isAudit ? "Close" : "Cancel"}
                </button>
              </div>

              {confirmReviewOpen && (
                <div className="blur-overlay" style={styles.modalOverlay} onClick={() => !confirming && setConfirmReviewOpen(false)}>
                  <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "16px", color: "#374151" }}>Review Updates Before Save</h4>
                        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
                          Article number and qty will stay fixed. Review the updated fields below.
                        </p>
                      </div>
                      <button type="button" onClick={() => setConfirmReviewOpen(false)} style={styles.closeButton} disabled={confirming}>
                        <X size={16} />
                      </button>
                    </div>

                    {reviewChanges.length === 0 ? (
                      <div className="table-empty" style={styles.emptyBox}>No editable fields were changed. The upload will save with the current preview values.</div>
                    ) : (
                      <div style={{ display: "grid", gap: "12px" }}>
                        {reviewChanges.map(({ row, index, changes }) => (
                          <div key={`${row.article_number}-${index}`} style={styles.subcard}>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
                              {row.article_number} {row.part_name ? `- ${row.part_name}` : ""}
                            </div>
                            <div style={{ display: "grid", gap: "6px" }}>
                              {changes.map((change, changeIndex) => (
                                <div key={changeIndex} style={{ fontSize: "12px", color: "#4b5563" }}>{change}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ ...styles.confirmActions, marginTop: "16px" }}>
                      <SecondaryButton type="button" onClick={() => setConfirmReviewOpen(false)} disabled={confirming}>
                        Back
                      </SecondaryButton>
                      {!isAudit && (
                        <PrimaryButton type="button" onClick={handleFinalConfirmSave} disabled={confirming}>
                          {confirming ? "Saving..." : "Confirm Save"}
                        </PrimaryButton>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* {showAddMaterialForm && (
                <div
                  className="blur-overlay"
                  style={styles.modalOverlay}
                  onClick={() => {
                    setShowAddMaterialForm(false);
                    resetNewMaterialDraft();
                  }}
                >
                  <div style={styles.addMaterialModalCard} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "16px", color: "#374151" }}>Add New Material</h4>
                        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
                          Add a material directly into the purchase preview before saving.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMaterialForm(false);
                          resetNewMaterialDraft();
                        }}
                        style={styles.closeButton}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div style={styles.addMaterialStack}>
                      <label style={styles.fieldLabel}>
                        Part Name
                        <input type="text" value={newMaterialDraft.part_name} onChange={(e) => handleNewMaterialDraftChange("part_name", e.target.value)} placeholder="Enter part name" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Article No.
                        <input type="text" value={newMaterialDraft.article_number} onChange={(e) => handleNewMaterialDraftChange("article_number", e.target.value)} placeholder="Enter article number" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Make
                        <input type="text" value={newMaterialDraft.make} onChange={(e) => handleNewMaterialDraftChange("make", e.target.value)} placeholder="Enter make" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Qty
                        <input type="number" min="0" step="1" value={newMaterialDraft.qty} onChange={(e) => handleNewMaterialDraftChange("qty", e.target.value)} placeholder="Enter qty" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Min Stock
                        <input type="number" min="0" step="1" value={newMaterialDraft.minimum_stock} onChange={(e) => handleNewMaterialDraftChange("minimum_stock", e.target.value)} placeholder="Enter min stock" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Lead Days
                        <input
                          type="text"
                          value={newMaterialDraft.lead_days}
                          onChange={(e) => {
                            const value = e.target.value.trim().toLowerCase();
                            if (value === "" || /^\d*[dw]?$/i.test(value)) {
                              handleNewMaterialDraftChange("lead_days", value);
                            }
                          }}
                          placeholder="Example: 5d or 2w"
                          style={styles.inlineInput}
                        />
                      </label>
                      <label style={styles.fieldLabel}>
                        Price
                        <input type="number" min="0" step="0.01" value={newMaterialDraft.price} onChange={(e) => handleNewMaterialDraftChange("price", e.target.value)} placeholder="Enter price" style={styles.inlineInput} />
                      </label>
                    </div>

                    <div style={{ ...styles.confirmActions, marginTop: "16px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMaterialForm(false);
                          resetNewMaterialDraft();
                        }}
                        style={styles.ghostButton}
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={handleAddMaterialRow} style={styles.addButton}>
                        Add Row
                      </button>
                    </div>
                  </div>
                </div>
              )} */}
            </div>
          )}

          {showAddMaterialForm && (
                <div
                  className="blur-overlay"
                  style={styles.modalOverlay}
                  onClick={() => {
                    setShowAddMaterialForm(false);
                    resetNewMaterialDraft();
                  }}
                >
                  <div style={styles.addMaterialModalCard} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.modalHeader}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "16px", color: "#374151" }}>Add New Material</h4>
                        <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
                          Add a material directly into the purchase preview before saving.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMaterialForm(false);
                          resetNewMaterialDraft();
                        }}
                        style={styles.closeButton}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div style={styles.addMaterialStack}>
                      <label style={styles.fieldLabel}>
                        Part Name
                        <input type="text" value={newMaterialDraft.part_name} onChange={(e) => handleNewMaterialDraftChange("part_name", e.target.value)} placeholder="Enter part name" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Article No.
                        <input type="text" value={newMaterialDraft.article_number} onChange={(e) => handleNewMaterialDraftChange("article_number", e.target.value)} placeholder="Enter article number" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Make
                        <input type="text" value={newMaterialDraft.make} onChange={(e) => handleNewMaterialDraftChange("make", e.target.value)} placeholder="Enter make" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Qty
                        <input type="number" min="0" step="1" value={newMaterialDraft.qty} onChange={(e) => handleNewMaterialDraftChange("qty", e.target.value)} placeholder="Enter qty" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Min Stock
                        <input type="number" min="0" step="1" value={newMaterialDraft.minimum_stock} onChange={(e) => handleNewMaterialDraftChange("minimum_stock", e.target.value)} placeholder="Enter min stock" style={styles.inlineInput} />
                      </label>
                      <label style={styles.fieldLabel}>
                        Lead Days
                        <input
                          type="text"
                          value={newMaterialDraft.lead_days}
                          onChange={(e) => {
                            const value = e.target.value.trim().toLowerCase();
                            if (value === "" || /^\d*[dw]?$/i.test(value)) {
                              handleNewMaterialDraftChange("lead_days", value);
                            }
                          }}
                          placeholder="Example: 5d or 2w"
                          style={styles.inlineInput}
                        />
                      </label>
                      <label style={styles.fieldLabel}>
                        Price
                        <input type="number" min="0" step="0.01" value={newMaterialDraft.price} onChange={(e) => handleNewMaterialDraftChange("price", e.target.value)} placeholder="Enter price" style={styles.inlineInput} />
                      </label>
                    </div>

                    <div style={{ ...styles.confirmActions, marginTop: "16px" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMaterialForm(false);
                          resetNewMaterialDraft();
                        }}
                        style={styles.ghostButton}
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={handleAddMaterialRow} style={styles.addButton}>
                        Add Row
                      </button>
                    </div>
                  </div>
                </div>
              )}

          {/* Drop zone — hidden while preview is showing or for audit role */}
          {!showPreview && !isAudit && (
            <>
              <div
                style={{ border: `2px dashed ${dragging ? "#7c3aed" : "#c4b5fd"}`, borderRadius: "12px", padding: "40px 24px", textAlign: "center", backgroundColor: dragging ? "#f5f3ff" : "#fafafa", transition: "all 0.2s ease", cursor: "pointer" }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={!file ? handleBrowse : undefined}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <div style={{ color: dragging ? "#7c3aed" : "#a78bfa", marginBottom: "12px" }}>
                  <UploadCloud size={40} />
                </div>
                <p style={{ fontSize: "15px", fontWeight: "500", color: "#374151", margin: "0 0 6px" }}>
                  Drag & drop your stock file here
                </p>
                <p style={{ fontSize: "13px", color: "#9ca3af", margin: "0 0 16px" }}>
                  Supports .csv, .xlsx, .xls
                </p>
                <button
                  style={{ padding: "8px 20px", backgroundColor: "transparent", border: "1px solid #7c3aed", borderRadius: "6px", color: "#7c3aed", fontSize: "13px", cursor: "pointer", fontWeight: "500" }}
                  onClick={(e) => { e.stopPropagation(); handleBrowse(); }}
                >
                  Browse File
                </button>
              </div>

              {file && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "12px 16px", marginTop: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FileText size={20} color="#7c3aed" />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "500", color: "#374151" }}>{file.name}</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>{(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                  <button style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }} onClick={handleRemoveFile}>
                    <X size={16} />
                  </button>
                </div>
              )}

              {file && !isAudit && (
                <button
                  disabled={uploading}
                  onClick={handleUpload}
                  style={{ display: "block", width: "100%", marginTop: "14px", padding: "10px", backgroundColor: uploading ? "#a78bfa" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: "500", cursor: uploading ? "not-allowed" : "pointer" }}
                >
                  {uploading ? "Uploading..." : "Upload File"}
                </button>
              )}

              {uploadStatus === "success" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "12px 16px", marginTop: "16px", color: "#166534", fontSize: "13px" }}>
                  <CheckCircle size={16} />{resultMsg || "Stock data uploaded successfully."}
                </div>
              )}

              {uploadStatus === "error" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px 16px", marginTop: "16px", color: "#991b1b", fontSize: "13px" }}>
                  ⚠ {errorMsg}
                </div>
              )}

              <p style={{ textAlign: "center", fontSize: "11px", color: "#9ca3af", marginTop: "12px" }}>
                Expected: <strong>article_number, qty</strong> required. <strong>part_name, make, minimum_stock, lead_days, price</strong> optional. File name must end with PURCHASE
              </p>
            </>
          )}
        </Card>

        {/* RIGHT — Material Issue Card */}
        <Card>
          <div style={styles.titleContainer}>
            <h3 className="section-title">Material Issue (Outward)</h3>
            <button
              onClick={() => handleHelpClick("inventory-outward")}
              style={styles.helpIconButton}
              className="help-icon-btn"
              title="View and issue reserved materials to production jobs."
            >
              <HelpCircle size={18} />
            </button>
          </div>

          <p className="text-secondary fw-600" style={{ marginBottom: "10px" }}>Reserved Fixtures</p>

          {reservedFixtures.length === 0 ? (
            <div className="table-empty" style={styles.emptyBox}>No fully reserved fixtures</div>
          ) : (
            <div style={styles.fixtureList}>
              {reservedFixtures.map((fixture) => (
                <div key={fixture.id} style={styles.fixtureCard}>
                  <div style={styles.fixtureCardTop}>
                    <div>
                      <div style={styles.fixtureTitle}>{fixture.product_details}</div>
                      <div style={styles.fixtureMeta}>
                        Fixture Qty: {fixture.fixture_qty}
                      </div>
                      <div style={styles.fixtureMeta}>
                        Created: {fixture.created_at}
                      </div>
                    </div>
                    <StatusBadge status={fixture.status} />
                  </div>
                    <div style={styles.fixtureActions}>
                      <SecondaryButton type="button" className="btn-sm" onClick={() => handleFixtureView(fixture.product_details)}>
                        View BOM
                      </SecondaryButton>
                      {!isAudit && (
                        <PrimaryButton type="button" className="btn-sm" onClick={() => setIssueConfirmFixture(fixture)}>
                          Issue
                        </PrimaryButton>
                      )}
                    </div>
                </div>
              ))}
            </div>
          )}

          {/* <p className="text-secondary fw-600">Reserved Jobs</p>

          <TableContainer className="table-container-sm">
            <table>
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Product</th>
                  <th>View</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {issueJobs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="table-empty">No Reserved Jobs</td>
                  </tr>
                ) : (
                  issueJobs.map((job) => (
                    <tr key={job.job_id}>
                      <td>{job.job_id}</td>
                      <td>{job.product_name}</td>
                      <td>
                        <SecondaryButton type="button" className="btn-sm" onClick={() => handleJobSelect(job.job_id)}>
                          View
                        </SecondaryButton>
                      </td>
                      <td>
                        <PrimaryButton type="button" className="btn-sm" onClick={() => handleIssue(job.job_id)}>
                          Issue
                        </PrimaryButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table> */}
          {/* </TableContainer> */}

          {message && (
            <div className="notice" style={styles.notice}>{message}</div>
          )}

          {jobDetails && (
            <div className="subcard" style={styles.subcard}>
              <div className="section-head">
                <h4 className="section-title small">Job Details</h4>
                <StatusBadge status={jobDetails.status} />
              </div>
              <div className="details-grid" style={styles.detailsGrid}>
                <div className="detail">
                  <span className="label">Product</span>
                  <span className="value">{jobDetails.product_name}</span>
                </div>
                <div className="detail">
                  <span className="label">Planned Qty</span>
                  <span className="value">{jobDetails.planned_qty}</span>
                </div>
                <div className="detail">
                  <span className="label">Target Date</span>
                  <span className="value">{jobDetails.target_date}</span>
                </div>
              </div>
              <h5 className="section-title tiny">Materials</h5>
              <TableContainer className="table-container-xs">
                <table>
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Reserved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobDetails.materials.map((m, index) => (
                      <tr key={index}>
                        <td>{m.material_code}</td>
                        <td>{m.reserved_qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
              {!isAudit && (
                <div className="form-actions">
                  <PrimaryButton type="button" onClick={() => handleIssue(jobDetails.job_id)}>
                    Issue Material
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}

          {fixtureModalOpen && fixtureDetails && (
            <div className="blur-overlay" style={styles.modalOverlay} onClick={() => setFixtureModalOpen(false)}>
              <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
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
                        <th>Reserved Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixtureDetails.materials.map((item, index) => (
                        <tr key={`${item.bo_part_name}-${item.article_number}-${index}`}>
                          <td>{item.bo_part_name}</td>
                          <td>{item.article_number}</td>
                          <td>{item.make}</td>
                          <td>{item.required_qty}</td>
                          <td>{item.reserved_qty}</td>
                        </tr>
                      ))}
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

          {issueConfirmFixture && (
            <div className="blur-overlay" style={styles.modalOverlay} onClick={() => !issuingFixture && setIssueConfirmFixture(null)}>
              <div style={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
                <h4 style={{ margin: "0 0 10px", fontSize: "16px", color: "#374151" }}>Confirm Fixture Issue</h4>
                <p style={{ margin: "0 0 6px", color: "#4b5563", fontSize: "14px" }}>
                  Product: <strong>{issueConfirmFixture.product_details}</strong>
                </p>
                <p style={{ margin: "0 0 16px", color: "#4b5563", fontSize: "14px" }}>
                  Fixture Qty: <strong>{issueConfirmFixture.fixture_qty}</strong>
                </p>
                <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: "13px" }}>
                  This will move reserved material to issued material and reduce stock quantity.
                </p>
                <div style={styles.confirmActions}>
                  <SecondaryButton type="button" onClick={() => setIssueConfirmFixture(null)} disabled={issuingFixture}>
                    Cancel
                  </SecondaryButton>
                  <PrimaryButton type="button" onClick={handleFixtureIssue} disabled={issuingFixture}>
                    {issuingFixture ? "Issuing..." : "Confirm Issue"}
                  </PrimaryButton>
                </div>
              </div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
};

const styles = {
  titleContainer: {
    display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px",
  },
  helpIconButton: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "32px", height: "32px", padding: "0", backgroundColor: "transparent",
    border: "none", borderRadius: "50%", cursor: "pointer",
    transition: "all 0.2s ease", color: "#6c757d",
  },
  notice: {
    marginTop: "15px", padding: "10px", backgroundColor: "#d4edda",
    border: "1px solid #c3e6cb", borderRadius: "4px", color: "#155724",
  },
  subcard: {
    marginTop: "20px", padding: "15px", backgroundColor: "#f8f9fa",
    borderRadius: "6px", border: "1px solid #e9ecef",
  },
  emptyBox: {
    padding: "16px", marginBottom: "18px", border: "1px dashed #d1d5db", borderRadius: "10px",
    backgroundColor: "#fafafa", color: "#6b7280",
  },
  fixtureList: {
    display: "grid", gap: "12px", marginBottom: "18px",
  },
  fixtureCard: {
    border: "1px solid #e5e7eb", borderRadius: "12px", padding: "14px",
    backgroundColor: "#fafafa",
  },
  fixtureCardTop: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px",
  },
  fixtureTitle: {
    fontSize: "15px", fontWeight: "700", color: "#1f2937", marginBottom: "6px",
  },
  fixtureMeta: {
    fontSize: "12px", color: "#6b7280", marginBottom: "4px",
  },
  fixtureActions: {
    display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap",
  },
  detailsGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    gap: "15px", marginBottom: "15px",
  },
  modalOverlay: {
    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 1200,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
  },
  modalCard: {
    width: "min(980px, 100%)", maxHeight: "85vh", overflow: "auto", backgroundColor: "#fff",
    borderRadius: "14px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  modalHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px",
    marginBottom: "16px",
  },
  closeButton: {
    background: "none", border: "none", cursor: "pointer", color: "#6b7280",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  confirmCard: {
    width: "min(460px, 100%)", backgroundColor: "#fff", borderRadius: "14px", padding: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  confirmActions: {
    display: "flex", justifyContent: "flex-end", gap: "10px",
  },
  addMaterialModalCard: {
    width: "min(760px, 100%)",
    backgroundColor: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  addMaterialStack: {
    display: "grid",
    gap: "12px",
  },
  fieldLabel: {
    display: "grid",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "600",
    color: "#374151",
  },
  inlineInput: {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "12px",
    backgroundColor: "#fff",
  },
  compactInput: {
    width: "100%",
    minWidth: "72px",
    padding: "4px 6px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    fontSize: "12px",
    textAlign: "center",
    backgroundColor: "#fff",
  },
  addButton: {
    padding: "8px 14px",
    backgroundColor: "#7c3aed",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },
  ghostButton: {
    padding: "8px 14px",
    backgroundColor: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
  },
};

export default PurchaseEntry;
