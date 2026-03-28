import React, { useState, useEffect, useRef } from "react";
import { useToast } from "../../context/ToastContext";
import {
  FiAlertTriangle,
  FiLock,
  FiGlobe,
  FiSave,
  FiTrash2,
  FiDownload,
  FiChevronDown,
  FiChevronUp,
  FiDatabase,
  FiCpu,
  FiFileText,
  FiActivity,
  FiBarChart2,
  FiAlertCircle,
  FiPlay,
  FiZap,
  FiSliders,
} from "react-icons/fi";
import { Button } from "../common";

const METADATA_OPTIONS = [
  { key: "include_models",         icon: FiCpu,       label: "Models",         description: "AI model metadata (name, format, version)." },
  { key: "include_datasets",       icon: FiDatabase,  label: "Datasets",       description: "Dataset metadata and class/schema information." },
  { key: "include_preprocessings", icon: FiSliders,   label: "Preprocessings", description: "Preprocessing pipeline configurations and parameters." },
  { key: "include_executions",     icon: FiPlay,      label: "Executions",     description: "Model training execution records and results." },
  { key: "include_optimizations",  icon: FiZap,       label: "Optimizations",  description: "Model optimization records and results." },
  { key: "include_reports",        icon: FiFileText,  label: "Reports",        description: "Execution and optimization report records." },
  { key: "include_activities",     icon: FiActivity,  label: "Activity Log",   description: "All workspace activity history." },
];

const FILE_OPTIONS = [
  { key: "include_dataset_files", icon: FiDatabase, label: "Dataset Files", description: "Raw dataset files (images, CSVs, etc.). Can be very large." },
  { key: "include_model_files", icon: FiCpu, label: "Model Weight Files", description: "Model weight files (.pt, .onnx, .safetensors, etc.). Can be very large." },
  { key: "include_report_files", icon: FiFileText, label: "Report PDF Files", description: "Generated PDF reports for executions and optimizations." },
];

const WorkspaceSettingsTab = ({ workspace, onUpdate, onDelete }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    include_preprocessings: true,
    include_executions: true,
    include_optimizations: true,
    include_datasets: true,
    include_models: true,
    include_reports: true,
    include_activities: true,
    include_metrics: false,
    include_dataset_files: false,
    include_model_files: false,
    include_report_files: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const { addToast, removeToast, success: toastSuccess, updateToast } = useToast();
  const exportToastId = useRef(null);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name || "");
      setDescription(workspace.description || "");
      setIsPublic(workspace.is_public || false);
      setShowDeleteConfirm(false);
    }
  }, [workspace]);

  if (!workspace) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdate({ name, description, is_public: isPublic });
    } catch (error) {
      console.error("Failed to update workspace", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error("Failed to delete workspace", error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
    }
  };

  const toggleExportOption = (key) =>
    setExportOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const setAllMetadata = (value) =>
    setExportOptions((prev) => ({
      ...prev,
      ...Object.fromEntries(METADATA_OPTIONS.map((o) => [o.key, value])),
    }));

  const setAllOptions = (value) =>
    setExportOptions((prev) =>
      Object.fromEntries(Object.keys(prev).map((k) => [k, value]))
    );

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    const toastId = addToast("Preparing export...", "loading", 0);
    exportToastId.current = toastId;
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams(
        Object.fromEntries(Object.entries(exportOptions).map(([k, v]) => [k, String(v)]))
      );

      // Step 1: start the export task
      const startResp = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/export?${params}`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!startResp.ok) {
        const body = await startResp.json().catch(() => ({}));
        throw new Error(body.detail || "Export failed to start.");
      }
      const { task_id } = await startResp.json();

      // Step 2: stream progress via SSE (using fetch so we can send auth header)
      const progressResp = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/export/${task_id}/progress`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const reader = progressResp.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(data.error);
          updateToast(toastId, { message: data.step, progress: data.progress });
        }
      }

      // Step 3: download the finished zip
      updateToast(toastId, { message: "Downloading...", progress: 100 });
      const dlResp = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/export/${task_id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!dlResp.ok) {
        const body = await dlResp.json().catch(() => ({}));
        throw new Error(body.detail || "Download failed.");
      }
      const disposition = dlResp.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `workspace_${workspace.id}_export.zip`;
      const blob = await dlResp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      removeToast(toastId);
      toastSuccess("Workspace exported successfully!");
      setExportOpen(false);
    } catch (err) {
      removeToast(exportToastId.current);
      setExportError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const CheckRow = ({ optKey, icon: Icon, label, description, accent = "primary" }) => {
    const active = exportOptions[optKey];
    const isAmber = accent === "amber";
    return (
      <label
        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all duration-150 ${
          active
            ? isAmber ? "border-amber-400 bg-amber-50" : "border-primary-400 bg-primary-50"
            : "border-gray-200 hover:border-gray-300 bg-white"
        }`}
      >
        <input
          type="checkbox"
          className="mt-0.5"
          checked={active}
          onChange={() => toggleExportOption(optKey)}
        />
        <div className="flex items-start gap-2">
          <Icon
            size={15}
            className={`mt-0.5 flex-shrink-0 ${
              active ? (isAmber ? "text-amber-600" : "text-primary-600") : "text-gray-400"
            }`}
          />
          <div>
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <p className="text-xs text-gray-500 leading-snug">{description}</p>
          </div>
        </div>
      </label>
    );
  };

  const anyFileSelected = exportOptions.include_dataset_files || exportOptions.include_model_files || exportOptions.include_report_files;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Workspace Settings</h2>
        <p className="text-sm text-gray-500">
          Manage your workspace details, visibility, and danger zone actions.
        </p>
      </div>

      {/* General settings form */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workspace Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows="4"
              />
            </div>
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Visibility
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onClick={() => setIsPublic(false)}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    !isPublic ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div className={`p-2 rounded-lg mr-3 ${!isPublic ? "bg-primary-100 text-primary-600" : "bg-gray-100 text-gray-500"}`}>
                      <FiLock size={20} />
                    </div>
                    <h3 className={`font-semibold ${!isPublic ? "text-primary-900" : "text-gray-900"}`}>Private</h3>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">Only you can see and access this workspace.</p>
                </div>
                <div
                  onClick={() => setIsPublic(true)}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    isPublic ? "border-primary-500 bg-primary-50" : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div className={`p-2 rounded-lg mr-3 ${isPublic ? "bg-primary-100 text-primary-600" : "bg-gray-100 text-gray-500"}`}>
                      <FiGlobe size={20} />
                    </div>
                    <h3 className={`font-semibold ${isPublic ? "text-primary-900" : "text-gray-900"}`}>Public</h3>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">Anyone on the internet can see this workspace.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="flex items-center">
                <FiSave className="mr-2" />
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Export â€” inline expand */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Header row â€” always visible */}
        <button
          type="button"
          onClick={() => { setExportOpen((v) => !v); setExportError(null); }}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FiDownload size={16} className="text-gray-500" />
            <span className="text-base font-medium text-gray-900">Export Workspace</span>
          </div>
          {exportOpen ? <FiChevronUp size={16} className="text-gray-400" /> : <FiChevronDown size={16} className="text-gray-400" />}
        </button>

        {/* Expanded panel */}
        {exportOpen && (
          <div className="border-t border-gray-200 px-6 py-5 space-y-5">
            <p className="text-sm text-gray-500">
              Choose what to include in the exported <span className="font-medium">.zip</span> archive.
            </p>

            {/* Metadata */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Metadata</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllOptions(true)} className="text-xs text-primary-600 hover:text-primary-800 font-medium">Select All</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setAllOptions(false)} className="text-xs text-gray-400 hover:text-gray-600 font-medium">Deselect All</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {METADATA_OPTIONS.map((opt) => (
                  <CheckRow key={opt.key} optKey={opt.key} icon={opt.icon} label={opt.label} description={opt.description} />
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Execution Metrics</p>
              <CheckRow
                optKey="include_metrics"
                icon={FiBarChart2}
                label="Detailed Metrics"
                description="Include heavy metric fields such as confusion matrix, per-class report, and label arrays. Disable to keep exports compact."
              />
            </div>

            {/* Binary files */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Binary Files</p>
              {FILE_OPTIONS.map((opt) => (
                <CheckRow key={opt.key} optKey={opt.key} icon={opt.icon} label={opt.label} description={opt.description} accent="amber" />
              ))}
              {anyFileSelected && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <FiAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Binary files can be very large. Make sure you have enough disk space before proceeding.</span>
                </div>
              )}
            </div>

            {exportError && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                <FiAlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{exportError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="inline-flex items-center gap-2 py-2 px-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-md transition-colors font-medium text-sm shadow-sm"
              >
                <FiDownload size={15} />
                {isExporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone — inline expand */}
      <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
        {/* Header row */}
        <button
          type="button"
          onClick={() => { setDangerOpen((v) => !v); setShowDeleteConfirm(false); }}
          className="w-full flex items-center justify-between px-6 py-4 bg-red-600 hover:bg-red-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FiAlertTriangle size={16} className="text-white" />
            <span className="text-base font-medium text-white">Danger Zone</span>
          </div>
          {dangerOpen ? <FiChevronUp size={16} className="text-red-200" /> : <FiChevronDown size={16} className="text-red-200" />}
        </button>

        {/* Expanded panel */}
        {dangerOpen && (
          <div className="border-t border-red-700 px-6 py-5 space-y-4 bg-red-100">
            <p className="text-sm text-red-600">
              Once you delete a workspace, there is no going back. This action will permanently delete all
              associated models, datasets, and executions. Please be certain.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 py-2 px-4 bg-white hover:bg-red-50 disabled:opacity-50 text-red-600 border border-red-200 rounded-md transition-colors font-medium text-sm shadow-sm"
            >
              <FiTrash2 size={15} />
              Delete Workspace
            </button>
          </div>
        )}
      </div>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Workspace</h3>
            <p className="text-gray-600 mb-4">
              This action <span className="font-semibold">cannot be undone</span>. All models, datasets, and executions associated with this workspace will be permanently deleted.
            </p>
            <p className="text-sm text-gray-700 mb-2">
              Please type <span className="font-semibold text-gray-900">{workspace.name}</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={workspace.name}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteConfirmText !== workspace.name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md transition-colors font-medium"
              >
                <FiTrash2 size={15} />
                {isDeleting ? "Deleting..." : "Delete Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSettingsTab;
