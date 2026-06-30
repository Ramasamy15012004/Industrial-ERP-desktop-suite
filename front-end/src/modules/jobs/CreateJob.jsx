import React, { useRef, useState } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle, FileText, HelpCircle, UploadCloud, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserRole } from "../../api/auth";
import * as XLSX from "xlsx";

const CreateJob = ({ embedded = false }) => {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [fixtureQty, setFixtureQty] = useState(1);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const role = getUserRole();
  const isAudit = role === "audit";

  const isProductMasterPage = location.pathname === "/settings/products";

  const handleHelpClick = () => {
    navigate("/help#settings-bom-setup");
  };

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
    if (!nameWithoutExt.toUpperCase().endsWith("BO")) {
      setErrorMsg("File name must end with 'BO'. Example: Fixture1_BO");
      setUploadStatus("error");
      return;
    }

    setFile(selectedFile);
    setUploadStatus(null);
    setErrorMsg("");
    setFixtureQty(1);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    handleFile(dropped);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleBrowse = () => fileInputRef.current.click();

  const handleRemoveFile = () => {
    setFile(null);
    setUploadStatus(null);
    setErrorMsg("");
    setFixtureQty(1);
    setShowPreview(false);
    setPreviewData(null);
    fileInputRef.current.value = "";
  };

  const parseRowsFromFile = async () => {
    const fileExt = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();

    if (fileExt === ".csv") {
      const text = await file.text();
      const lines = text.split("\n").filter((line) => line.trim());
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",");
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx]?.trim() || "";
        });
        rows.push(row);
      }

      return rows;
    }

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  };

  const handleProductMasterUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);

      const fileExt = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase();

      if (fileExt === ".csv") {
        const formData = new FormData();
        formData.append("file", file);
        await axios.post("http://localhost:8000/upload-products-csv", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        const rows = await parseRowsFromFile();

        if (rows.length === 0) {
          setErrorMsg("Excel file is empty or has no data rows");
          setUploadStatus("error");
          setUploading(false);
          return;
        }

        await axios.post("http://localhost:8000/upload-products-excel", {
          rows: rows.map((row) => ({ ...row, __filename__: file.name.replace(/\.[^.]+$/, "") })),
        });
      }

      setUploadStatus("success");
      setFile(null);
      fileInputRef.current.value = "";
    } catch (error) {
      setErrorMsg(error.response?.data?.detail || "Upload failed. Check file format.");
      setUploadStatus("error");
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!file || fixtureQty < 1) {
      setErrorMsg("Please select a file and enter valid fixture quantity");
      setUploadStatus("error");
      return;
    }

    try {
      setUploading(true);

      const rows = await parseRowsFromFile();

      if (rows.length === 0) {
        setErrorMsg("File is empty or has no data rows");
        setUploadStatus("error");
        setUploading(false);
        return;
      }

      const response = await axios.post("http://localhost:8000/fixture-bom/preview", {
        rows: rows.map((row) => ({ ...row, __filename__: file.name.replace(/\.[^.]+$/, "") })),
        fixture_qty: fixtureQty,
      });

      setPreviewData(response.data);
      setShowPreview(true);
    } catch (error) {
      setErrorMsg(error.response?.data?.detail || "Preview failed. Check file format.");
      setUploadStatus("error");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    try {
      setUploading(true);

      await axios.post("http://localhost:8000/fixture-bom/confirm", {
        rows: previewData.bom_items,
        fixture_qty: fixtureQty,
        product_details: previewData.product_details,
      });

      setUploadStatus("success");
      setShowPreview(false);
      setFile(null);
      setFixtureQty(1);
      setPreviewData(null);
      fileInputRef.current.value = "";
    } catch (error) {
      setErrorMsg(error.response?.data?.detail || "Upload failed.");
      setUploadStatus("error");
      setShowPreview(false);
    } finally {
      setUploading(false);
    }
  };

  const styles = {
    page: {
      padding: "24px",
    },
    header: {
      marginBottom: "24px",
    },
    titleContainer: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
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
    dropZone: {
      border: `2px dashed ${dragging ? "#7c3aed" : "#c4b5fd"}`,
      borderRadius: "12px",
      padding: "60px 40px",
      textAlign: "center",
      backgroundColor: dragging ? "#f5f3ff" : "#fafafa",
      transition: "all 0.2s ease",
      cursor: "pointer",
      maxWidth: "560px",
      margin: "0 auto",
    },
    icon: {
      color: dragging ? "#7c3aed" : "#a78bfa",
      marginBottom: "16px",
    },
    dropTitle: {
      fontSize: "16px",
      fontWeight: "500",
      color: "#374151",
      margin: "0 0 6px",
    },
    dropSub: {
      fontSize: "13px",
      color: "#9ca3af",
      margin: "0 0 20px",
    },
    browseBtn: {
      display: "inline-block",
      padding: "8px 20px",
      backgroundColor: "transparent",
      border: "1px solid #7c3aed",
      borderRadius: "6px",
      color: "#7c3aed",
      fontSize: "13px",
      cursor: "pointer",
      fontWeight: "500",
      transition: "all 0.2s ease",
    },
    fileCard: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      backgroundColor: "#f5f3ff",
      border: "1px solid #ddd6fe",
      borderRadius: "8px",
      padding: "12px 16px",
      maxWidth: "560px",
      margin: "16px auto 0",
    },
    fileInfo: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
    },
    fileName: {
      fontSize: "13px",
      fontWeight: "500",
      color: "#374151",
    },
    fileSize: {
      fontSize: "11px",
      color: "#9ca3af",
      marginTop: "2px",
    },
    removeBtn: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "#9ca3af",
      display: "flex",
      alignItems: "center",
      padding: "2px",
    },
    fixtureInput: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      maxWidth: "560px",
      margin: "16px auto 0",
    },
    inputLabel: {
      fontSize: "13px",
      fontWeight: "500",
      color: "#374151",
    },
    input: {
      padding: "10px 12px",
      border: "1px solid #d1d5db",
      borderRadius: "6px",
      fontSize: "14px",
      outline: "none",
    },
    uploadBtn: {
      display: "block",
      width: "100%",
      maxWidth: "560px",
      margin: "14px auto 0",
      padding: "10px",
      backgroundColor: uploading ? "#a78bfa" : "#7c3aed",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      cursor: uploading ? "not-allowed" : "pointer",
      transition: "background 0.2s ease",
    },
    successBox: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      backgroundColor: "#f0fdf4",
      border: "1px solid #86efac",
      borderRadius: "8px",
      padding: "12px 16px",
      maxWidth: "560px",
      margin: "16px auto 0",
      color: "#166534",
      fontSize: "13px",
    },
    errorBox: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      backgroundColor: "#fef2f2",
      border: "1px solid #fca5a5",
      borderRadius: "8px",
      padding: "12px 16px",
      maxWidth: "560px",
      margin: "16px auto 0",
      color: "#991b1b",
      fontSize: "13px",
    },
    csvHint: {
      textAlign: "center",
      fontSize: "11px",
      color: "#9ca3af",
      maxWidth: "560px",
      margin: "12px auto 0",
    },
    modal: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalContent: {
      backgroundColor: "white",
      borderRadius: "12px",
      maxWidth: "900px",
      width: "90%",
      maxHeight: "80vh",
      overflow: "auto",
      padding: "24px",
    },
    modalHeader: {
      fontSize: "18px",
      fontWeight: "600",
      marginBottom: "16px",
      color: "#374151",
    },
    previewTable: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: "12px",
      marginBottom: "20px",
    },
    previewTh: {
      backgroundColor: "#f3f4f6",
      padding: "8px",
      textAlign: "left",
      fontWeight: "600",
      borderBottom: "2px solid #e5e7eb",
    },
    previewTd: {
      padding: "8px",
      borderBottom: "1px solid #e5e7eb",
    },
    modalActions: {
      display: "flex",
      gap: "12px",
      justifyContent: "flex-end",
    },
    btnSecondary: {
      padding: "8px 16px",
      backgroundColor: "#e5e7eb",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "500",
    },
    btnPrimary: {
      padding: "8px 16px",
      backgroundColor: "#7c3aed",
      color: "white",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "500",
    },
    statusBadge: {
      padding: "4px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: "500",
    },
  };

  const getStatusStyle = (status) => {
    if (status === "Reserved") {
      return { ...styles.statusBadge, backgroundColor: "#d1fae5", color: "#065f46" };
    }
    if (status === "Partial Reserved") {
      return { ...styles.statusBadge, backgroundColor: "#fef3c7", color: "#92400e" };
    }
    return { ...styles.statusBadge, backgroundColor: "#fee2e2", color: "#991b1b" };
  };

  return (
    <div className={embedded ? "" : "module-page scroll-auto"} style={embedded ? undefined : styles.page}>
      {!embedded && <div style={styles.header}>
        <div style={styles.titleContainer}>
          <h3 className="section-title" style={{ margin: 0 }}>
            {isProductMasterPage ? "Product Master" : "Create Job"}
          </h3>
          <button
            onClick={handleHelpClick}
            style={styles.helpIconButton}
            className="help-icon-btn"
            title="Product Master – Create and manage products with their Bill of Materials (BOM). Define the materials and quantities needed to manufacture each product. You can add multiple materials to create complex product structures."
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>}

      <div
        style={styles.dropZone}
        onDrop={isAudit ? undefined : handleDrop}
        onDragOver={isAudit ? undefined : handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={(!file && !isAudit) ? handleBrowse : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv, .xlsx, .xls"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div style={styles.icon}>
          <UploadCloud size={48} />
        </div>
        <p style={styles.dropTitle}>
          {isProductMasterPage ? "Drag & drop your CSV file here" : "Drag & drop your BO file here"}
        </p>
        <p style={styles.dropSub}>or click to browse from your computer</p>
        <button
          style={styles.browseBtn}
          onClick={(e) => {
            e.stopPropagation();
            if (!isAudit) handleBrowse();
          }}
          disabled={isAudit}
        >
          Browse File
        </button>
      </div>

      {file && (
        <div style={styles.fileCard}>
          <div style={styles.fileInfo}>
            <FileText size={20} color="#7c3aed" />
            <div>
              <div style={styles.fileName}>{file.name}</div>
              <div style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</div>
            </div>
          </div>
          {!isAudit && (
            <button style={styles.removeBtn} onClick={handleRemoveFile} title="Remove">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {!isProductMasterPage && file && (
        <div style={styles.fixtureInput}>
          <label style={styles.inputLabel}>Fixture Quantity</label>
          <input
            type="number"
            min="1"
            value={fixtureQty}
            onChange={(e) => setFixtureQty(parseInt(e.target.value, 10) || 1)}
            style={styles.input}
            placeholder="Enter number of fixtures"
          />
        </div>
      )}

      {file && !isAudit && (
        <button
          style={styles.uploadBtn}
          onClick={isProductMasterPage ? handleProductMasterUpload : handlePreview}
          disabled={uploading}
        >
          {isProductMasterPage
            ? (uploading ? "Uploading..." : "Upload CSV")
            : (uploading ? "Processing..." : "Preview & Upload")}
        </button>
      )}

      {uploadStatus === "success" && (
        <div style={styles.successBox}>
          <CheckCircle size={16} />
          {isProductMasterPage ? "Products uploaded successfully from CSV." : "Fixture BOM uploaded successfully."}
        </div>
      )}

      {uploadStatus === "error" && (
        <div style={styles.errorBox}>
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      <p style={styles.csvHint}>
        {isProductMasterPage ? (
          <>
            Expected format: <strong>product_id, product_name, material_code, quantity</strong> — one BOM line per
            row · Supports .csv, .xlsx, .xls
          </>
        ) : (
          <>
            Expected format: <strong>bo_no, bo_part_name, article_no, make, qty</strong> — one BOM line per row ·
            Supports .csv, .xlsx, .xls
          </>
        )}
      </p>

      {!isProductMasterPage && showPreview && previewData && (
        <div className="blur-overlay" style={styles.modal} onClick={() => setShowPreview(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              Preview: {previewData.product_details} (Fixture Qty: {fixtureQty})
            </div>

            <table style={styles.previewTable}>
              <thead>
                <tr>
                  <th style={styles.previewTh}>BO No</th>
                  <th style={styles.previewTh}>Part Name</th>
                  <th style={styles.previewTh}>Article No</th>
                  <th style={styles.previewTh}>Make</th>
                  <th style={styles.previewTh}>Qty/Unit</th>
                  <th style={styles.previewTh}>Required</th>
                  <th style={styles.previewTh}>Available</th>
                  <th style={styles.previewTh}>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewData.bom_items.map((item, idx) => (
                  <tr key={idx}>
                    <td style={styles.previewTd}>{item.bo_no}</td>
                    <td style={styles.previewTd}>{item.bo_part_name}</td>
                    <td style={styles.previewTd}>{item.article_number}</td>
                    <td style={styles.previewTd}>{item.make}</td>
                    <td style={styles.previewTd}>{item.unit_qty}</td>
                    <td style={styles.previewTd}>{item.required_qty}</td>
                    <td style={styles.previewTd}>{item.available_qty}</td>
                    <td style={styles.previewTd}>
                      <span style={getStatusStyle(item.status)}>{item.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={styles.modalActions}>
              <button style={styles.btnSecondary} onClick={() => setShowPreview(false)}>
                Cancel
              </button>
              {!isAudit && (
                <button style={styles.btnPrimary} onClick={handleConfirmUpload} disabled={uploading}>
                  {uploading ? "Uploading..." : "Confirm Upload"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateJob;
