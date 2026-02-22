import React, { useEffect } from "react";
import {
  FiX,
  FiCheckCircle,
  FiAlertCircle,
  FiInfo,
  FiAlertTriangle,
} from "react-icons/fi";

const icons = {
  success: <FiCheckCircle className="w-5 h-5" />,
  error: <FiAlertCircle className="w-5 h-5" />,
  info: <FiInfo className="w-5 h-5" />,
  warning: <FiAlertTriangle className="w-5 h-5" />,
};

const colors = {
  success: "bg-white text-gray-800 border-green-500",
  error: "bg-white text-gray-800 border-accent-500",
  info: "bg-white text-gray-800 border-primary-500",
  warning: "bg-white text-gray-800 border-yellow-500",
};

const iconColors = {
  success: "text-green-500 bg-green-50",
  error: "text-accent-500 bg-accent-50",
  info: "text-primary-500 bg-primary-50",
  warning: "text-yellow-500 bg-yellow-50",
};

export const Toast = ({
  id,
  type = "info",
  message,
  onClose,
  duration = 3000,
}) => {
  useEffect(() => {
    if (duration) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose]);

  return (
    <div
      className={`flex items-center w-full max-w-sm p-4 mb-4 rounded-lg shadow-lg border-l-4 ${colors[type]} animate-fade-in-up`}
      role="alert"
    >
      <div
        className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${iconColors[type]}`}
      >
        {icons[type]}
      </div>
      <div className="ml-3 text-sm font-medium">{message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex h-8 w-8"
        onClick={() => onClose(id)}
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <FiX className="w-5 h-5" />
      </button>
    </div>
  );
};
