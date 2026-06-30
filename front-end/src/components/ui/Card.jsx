import React from "react";

const Card = ({ padded = true, className = "", children }) => {
  const paddedClass = padded ? "padded" : "";
  return (
    <div className={`card ${paddedClass} ${className}`.trim()}>
      {children}
    </div>
  );
};

export default Card;

