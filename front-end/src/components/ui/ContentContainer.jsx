import React from "react";

const ContentContainer = ({
  scroll = "hidden",
  className = "",
  children,
}) => {
  const scrollClass = scroll === "auto" ? "scroll-auto" : "";
  return (
    <section className={`content-container ${scrollClass} ${className}`.trim()}>
      {children}
    </section>
  );
};

export default ContentContainer;

