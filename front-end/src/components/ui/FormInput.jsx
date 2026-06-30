import React from "react";

const FormInput = React.forwardRef(function FormInput(
  { label, error, as = "input", className = "", children, ...props },
  ref
) {
  const Component = as;

  return (
    <div className="form-field">
      {label && <label className="form-label">{label}</label>}
      <Component ref={ref} className={`form-control ${className}`.trim()} {...props}>
        {children}
      </Component>
      {error && <div className="form-error">{error}</div>}
    </div>
  );
});

export default FormInput;

