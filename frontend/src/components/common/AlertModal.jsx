import React from "react";

export const AlertModal = ({
  isOpen,
  message,
  title,
  type,
  isConfirm,
  onConfirm,
  onCancel,
  onClose,
}) => {
  if (!isOpen) return null;

  const buttonStyles = {
    info: "bg-primary-600 hover:bg-primary-700",
    success: "bg-green-600 hover:bg-green-700",
    warning: "bg-yellow-600 hover:bg-yellow-700",
    error: "bg-accent-600 hover:bg-accent-700",
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3">
          {isConfirm && (
            <button
              onClick={onCancel || onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors font-medium"
            >
              Cancel
            </button>
          )}
          <button
            onClick={isConfirm ? onConfirm : onClose}
            className={`px-4 py-2 text-white rounded-md transition-colors font-medium flex items-center justify-center min-w-[80px] ${buttonStyles[type] || buttonStyles.info}`}
          >
            {isConfirm ? "Confirm" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
};
