import React from "react";

const PrimaryButton = ({ className = "", ...props }) => {
  return <button className={`btn btn-primary ${className}`.trim()} {...props} />;
};

export default PrimaryButton;

