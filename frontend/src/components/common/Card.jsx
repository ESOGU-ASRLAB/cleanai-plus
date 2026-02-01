import React from "react";

const Card = ({ children, className = "", hover = false, ...props }) => {
  return (
    <div
      className={`
        bg-white rounded-xl shadow-soft p-6
        ${hover ? "hover:shadow-medium transition-shadow duration-300" : ""}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
