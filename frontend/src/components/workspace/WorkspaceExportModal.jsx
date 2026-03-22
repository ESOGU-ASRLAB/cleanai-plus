import React, { useState } from "react";
import {
  FiDownload,
  FiX,
  FiDatabase,
  FiCpu,
  FiFileText,
  FiActivity,
  FiHardDrive,
  FiAlertCircle,
  FiBarChart2,
} from "react-icons/fi";
import { Button } from "../common";

const METADATA_OPTIONS = [
  {
    key: "include_datasets",
    icon: FiDatabase,
    label: "Datasets",
    description: "Dataset metadata and class/schema information.",
  },
  {
    key: "include_models",
    icon: FiCpu,
    label: "Models",
    description: "AI model metadata (name, format, version).",
  },
  {
    key: "include_reports",
    icon: FiFileText,
    label: "Reports",
    description: "Execution and optimization report records.",
  },
  {
    key: "include_activities",
    icon: FiActivity,
    label: "Activity Log",
    description: "All workspace activity history.",
  },
];

const FILE_OPTIONS = [
  {
    key: "include_dataset_files",
    icon: FiDatabase,
    label: "Dataset Files",
    description: "Raw dataset files (images, CSVs, etc.). Can be very large.",
  },
  {
    key: "include_model_files",
    icon: FiCpu,
    label: "Model Weight Files",
    description: "Model weight files (.pt, .onnx, .safetensors, etc.). Can be very large.",
  },
];

const WorkspaceExportModal = ({ workspace, onClose }) => {
  const [options, setOptions] = useState({
    include_datasets: true,
    include_models: true,
    include_reports: true,
    include_activities: true,
    include_metrics: true,
    include_dataset_files: false,
    include_model_files: false,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (key) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const anyFileSelected = options.include_dataset_files || options.include_model_files;

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams({
        include_datasets: options.include_datasets,
        include_models: options.include_models,
        include_reports: options.include_reports,
        include_activities: options.include_activities,
        include_metrics: options.include_metrics,
        include_dataset_files: options.include_dataset_files,
        include_model_files: options.include_model_files,
      });

      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/export?${params}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Export failed. Please try again.");
      }

      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `workspace_${workspace.id}_export.zip`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const CheckRow = ({ optKey, icon: Icon, label, description, accent = "primary" }) => {
    const active = options[optKey];
    const borderCls = active
      ? accent === "amber"
        ? "border-amber-400 bg-amber-50"
        : "border-primary-400 bg-primary-50"
      : "border-gray-200 hover:border-gray-300 bg-white";
    const iconCls = active
      ? accent === "amber"
        ? "text-amber-600"
        : "text-primary-600"
      : "text-gray-400";

    return (
      <label
        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-150 ${borderCls}`}
      >
        <input
          type="checkbox"
          className={`mt-0.5 accent-${accent === "amber" ? "amber-500" : "primary-600"}`}
          checked={active}
          onChange={() => toggle(optKey)}
        />
        <div className="flex items-start gap-2">
          <Icon size={16} className={`mt-0.5 flex-shrink-0 ${iconCls}`} />
          <div>
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <p className="text-xs text-gray-500 leading-snug">{description}</p>
          </div>
        </div>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-50 rounded-lg">
              <FiDownload className="text-primary-600" size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Export Workspace
              </h2>
              <p className="text-xs text-gray-500">{workspace.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <p className="text-sm text-gray-600">
            Choose what to include in the exported{" "}
            <span className="font-medium">.zip</span> archive.
          </p>

          {/* Metadata */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Metadata
            </p>
            {METADATA_OPTIONS.map((opt) => (
              <CheckRow key={opt.key} optKey={opt.key} icon={opt.icon} label={opt.label} description={opt.description} />
            ))}
          </div>

          {/* Metrics */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Execution Metrics
            </p>
            <CheckRow
              optKey="include_metrics"
              icon={FiBarChart2}
              label="Detailed Metrics"
              description="Include heavy metric fields such as confusion matrix, per-class report, and label arrays. Disable to keep exports compact."
            />
          </div>

          {/* Binary files */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Binary Files
            </p>
            {FILE_OPTIONS.map((opt) => (
              <CheckRow key={opt.key} optKey={opt.key} icon={opt.icon} label={opt.label} description={opt.description} accent="amber" />
            ))}
            {anyFileSelected && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <FiAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Binary files can be very large. Make sure you have enough disk
                  space before proceeding.
                </span>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <FiAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting} className="inline-flex items-center">
            <FiDownload className="mr-2 flex-shrink-0" size={15} />
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceExportModal;
