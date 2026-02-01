import React, { createContext, useContext, useState, useCallback } from "react";
import { Toast } from "../components/common/Toast";

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info", duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prevToasts) => [...prevToasts, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const success = (message, duration) => addToast(message, "success", duration);
  const error = (message, duration) => addToast(message, "error", duration);
  const info = (message, duration) => addToast(message, "info", duration);
  const warning = (message, duration) => addToast(message, "warning", duration);

  return (
    <ToastContext.Provider
      value={{ addToast, removeToast, success, error, info, warning }}
    >
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
