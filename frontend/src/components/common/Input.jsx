import React, { forwardRef } from "react";

const Input = forwardRef(
  (
    {
      label,
      error,
      helperText,
      type = "text",
      placeholder,
      icon: Icon,
      className = "",
      ...props
    },
    ref,
  ) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <input
            ref={ref}
            type={type}
            placeholder={placeholder}
            className={`
              w-full rounded-lg border transition-all duration-200 bg-white
            ${Icon ? "pl-10 pr-4" : "px-4"} py-2.5
            ${
              error
                ? "border-accent-500 focus:border-accent-500 focus:ring-accent-500"
                : "border-gray-300 focus:border-primary-500 focus:ring-primary-500"
            }
            focus:outline-none focus:ring-2 focus:ring-opacity-50
            disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
            ${className}
          `}
            {...props}
          />
        </div>
        {error && <p className="mt-1.5 text-sm text-accent-600">{error}</p>}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
