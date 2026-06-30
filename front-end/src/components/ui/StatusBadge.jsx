import React from "react";

const normalizeStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const statusToVariant = (status) => {
  switch (normalizeStatus(status)) {
    case "reserved":
      return "reserved";
    case "partially reserved":
      return "partially-reserved";
    case "in progress":
      return "in-progress";
    case "completed":
      return "completed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      return "unknown";
  }
};

const StatusBadge = ({ status, className = "" }) => {
  const variant = statusToVariant(status);
  return (
    <span className={`status-badge status-badge--${variant} ${className}`.trim()}>
      {status || "-"}
    </span>
  );
};

export default StatusBadge;

