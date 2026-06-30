import React from "react";

const SecondaryButton = ({ tone = "neutral", className = "", ...props }) => {
  const toneClass = tone === "danger" ? "btn-danger" : "btn-secondary";
  return <button className={`btn ${toneClass} ${className}`.trim()} {...props} />;
};

export default SecondaryButton;

