import React from "react";

const FormContainer = ({ className = "", children }) => {
  return <div className={`form-container ${className}`.trim()}>{children}</div>;
};

export default FormContainer;

