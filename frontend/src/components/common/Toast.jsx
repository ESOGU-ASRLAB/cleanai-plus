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
  success: "bg-green-50 text-green-800 border-green-200",
  error: "bg-red-50 text-red-800 border-red-200",
  info: "bg-blue-50 text-blue-800 border-blue-200",
  warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
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
      className={`flex items-center w-full max-w-sm p-4 mb-4 text-gray-500 bg-white rounded-lg shadow border dark:text-gray-400 dark:bg-gray-800 ${colors[type]}`}
      role="alert"
    >
      <div
        className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 rounded-lg ${type === "success" ? "bg-green-100 text-green-500" : type === "error" ? "bg-red-100 text-red-500" : type === "warning" ? "bg-yellow-100 text-yellow-500" : "bg-blue-100 text-blue-500"}`}
      >
        {icons[type]}
      </div>
      <div className="ml-3 text-sm font-normal">{message}</div>
      <button
        type="button"
        className="ml-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex h-8 w-8 dark:text-gray-500 dark:hover:text-white dark:bg-gray-800 dark:hover:bg-gray-700"
        onClick={() => onClose(id)}
        aria-label="Close"
      >
        <span className="sr-only">Close</span>
        <FiX className="w-5 h-5" />
      </button>
    </div>
  );
};
