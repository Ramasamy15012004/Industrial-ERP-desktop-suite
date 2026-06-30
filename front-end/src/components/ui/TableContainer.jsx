import React from "react";

const TableContainer = ({ className = "", children, ...rest }) => {
  return (
    <div {...rest} className={`table-container ${className}`.trim()}>
      {children}
    </div>
  );
};

export default TableContainer;
