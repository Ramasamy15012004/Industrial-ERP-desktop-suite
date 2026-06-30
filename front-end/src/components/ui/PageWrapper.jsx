import React from "react";

const PageWrapper = ({ title, subtitle, actions, className = "", children }) => {
  return (
    <div className={`page-wrapper ${className}`.trim()}>
      {(title || subtitle || actions) && (
        <div className="page-header">
          <div>
            {title && <h2 className="page-heading">{title}</h2>}
            {subtitle && <p className="page-subheading">{subtitle}</p>}
          </div>
          {actions && <div>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

export default PageWrapper;

