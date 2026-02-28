import React, { useState, useEffect } from "react";
import { Card, Button } from "../common";
import { Toast } from "../common/Toast";
import userService from "../../services/userService";

const NotificationSettings = () => {
  const [settings, setSettings] = useState({
    execution_success: true,
    execution_failure: true,
    optimization_success: true,
    optimization_failure: true,
    marketing: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await userService.getNotificationSettings();
        setSettings({
          execution_success: data.execution_success,
          execution_failure: data.execution_failure,
          optimization_success: data.optimization_success ?? true,
          optimization_failure: data.optimization_failure ?? true,
          marketing: data.marketing,
        });
      } catch (error) {
        console.error("Failed to fetch notification settings:", error);
        setMessage({ type: "error", text: "Failed to load settings." });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleToggle = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await userService.updateNotificationSettings(settings);
      setMessage({
        type: "success",
        text: "Notification settings saved successfully!",
      });
    } catch (error) {
      console.error("Failed to save notification settings:", error);
      setMessage({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 mt-6">
      <h2 className="text-xl font-bold mb-4">Notification Settings</h2>
      <p className="text-gray-500 text-sm mb-6">
        Manage which email notifications you want to receive from CleanAI+.
      </p>

      {message && (
        <Toast
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
        />
      )}

      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Executions
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-900">
              Execution Success
            </h3>
            <p className="text-sm text-gray-500">
              Receive an email with metrics and a PDF report when a model
              execution completes successfully.
            </p>
          </div>
          <button
            type="button"
            className={`${
              settings.execution_success ? "bg-blue-600" : "bg-gray-200"
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            role="switch"
            aria-checked={settings.execution_success}
            onClick={() => handleToggle("execution_success")}
          >
            <span
              aria-hidden="true"
              className={`${
                settings.execution_success ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-900">
              Execution Failure
            </h3>
            <p className="text-sm text-gray-500">
              Receive an email alert if a model execution fails due to an error.
            </p>
          </div>
          <button
            type="button"
            className={`${
              settings.execution_failure ? "bg-blue-600" : "bg-gray-200"
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            role="switch"
            aria-checked={settings.execution_failure}
            onClick={() => handleToggle("execution_failure")}
          >
            <span
              aria-hidden="true"
              className={`${
                settings.execution_failure ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Network Optimization
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-900">
              Optimization Success
            </h3>
            <p className="text-sm text-gray-500">
              Receive an email with pruning statistics when a network
              optimization completes successfully.
            </p>
          </div>
          <button
            type="button"
            className={`${
              settings.optimization_success ? "bg-blue-600" : "bg-gray-200"
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            role="switch"
            aria-checked={settings.optimization_success}
            onClick={() => handleToggle("optimization_success")}
          >
            <span
              aria-hidden="true"
              className={`${
                settings.optimization_success ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-900">
              Optimization Failure
            </h3>
            <p className="text-sm text-gray-500">
              Receive an email alert if a network optimization fails due to an
              error.
            </p>
          </div>
          <button
            type="button"
            className={`${
              settings.optimization_failure ? "bg-blue-600" : "bg-gray-200"
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            role="switch"
            aria-checked={settings.optimization_failure}
            onClick={() => handleToggle("optimization_failure")}
          >
            <span
              aria-hidden="true"
              className={`${
                settings.optimization_failure ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            General
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-medium text-gray-900">
              Marketing &amp; Updates
            </h3>
            <p className="text-sm text-gray-500">
              Receive emails about new features, updates, and promotional
              offers.
            </p>
          </div>
          <button
            type="button"
            className={`${
              settings.marketing ? "bg-blue-600" : "bg-gray-200"
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2`}
            role="switch"
            aria-checked={settings.marketing}
            onClick={() => handleToggle("marketing")}
          >
            <span
              aria-hidden="true"
              className={`${
                settings.marketing ? "translate-x-5" : "translate-x-0"
              } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
          </button>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <Button
            onClick={handleSave}
            loading={saving}
            className="w-full sm:w-auto"
          >
            Save Preferences
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default NotificationSettings;
