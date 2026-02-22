import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertModal } from "../components/common/AlertModal";

const AlertContext = createContext();

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
};

export const AlertProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    isOpen: false,
    message: "",
    title: "Alert",
    type: "info", // info, success, warning, error
    isConfirm: false,
    onConfirm: null,
    onCancel: null,
  });

  const showAlert = useCallback((message, title = "Alert", type = "info") => {
    setAlertState({
      isOpen: true,
      message,
      title,
      type,
      isConfirm: false,
      onConfirm: null,
      onCancel: null,
    });
  }, []);

  const showConfirm = useCallback(
    (message, title = "Confirm", type = "warning") => {
      return new Promise((resolve) => {
        setAlertState({
          isOpen: true,
          message,
          title,
          type,
          isConfirm: true,
          onConfirm: () => {
            setAlertState((prev) => ({ ...prev, isOpen: false }));
            resolve(true);
          },
          onCancel: () => {
            setAlertState((prev) => ({ ...prev, isOpen: false }));
            resolve(false);
          },
        });
      });
    },
    [],
  );

  const closeAlert = useCallback(() => {
    if (alertState.onCancel) {
      alertState.onCancel();
    } else {
      setAlertState((prev) => ({ ...prev, isOpen: false }));
    }
  }, [alertState]);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertModal
        isOpen={alertState.isOpen}
        message={alertState.message}
        title={alertState.title}
        type={alertState.type}
        isConfirm={alertState.isConfirm}
        onConfirm={alertState.onConfirm}
        onCancel={alertState.onCancel}
        onClose={closeAlert}
      />
    </AlertContext.Provider>
  );
};
