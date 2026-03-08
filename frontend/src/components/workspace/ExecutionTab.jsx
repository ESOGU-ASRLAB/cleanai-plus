import React, { useState, useEffect } from "react";
import { Stepper, Button, Card, Input } from "../common";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import {
  FiPlay,
  FiCpu,
  FiDatabase,
  FiLayers,
  FiSettings,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiActivity,
  FiArrowLeft,
  FiArrowRight,
  FiTerminal,
  FiX,
  FiFileText,
  FiStopCircle,
  FiChevronRight,
} from "react-icons/fi";

const EXECUTION_STEPS = [
  { id: 1, title: "Select Model" },
  { id: 2, title: "Select Dataset" },
  { id: 3, title: "Preprocessing" },
  { id: 4, title: "Configuration" },
  { id: 5, title: "Review & Run" },
];

const ExecutionTab = ({ workspace, initialExecutionId, isReadonly = false }) => {
  const { token } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const [view, setView] = useState("list"); // "list" | "create"
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [showFullError, setShowFullError] = useState(false);
  const [executionProgress, setExecutionProgress] = useState({});

  // Wizard State
  const [activeStep, setActiveStep] = useState(1);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedPreprocessing, setSelectedPreprocessing] = useState(null);
  const [config, setConfig] = useState({
    batch_size: 32,
    device: "cuda",
    shuffle_dataset: true,
  });

  // Data for selections
  const [models, setModels] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [preprocessings, setPreprocessings] = useState([]);

  useEffect(() => {
    fetchExecutions();
    fetchAllResources();
  }, [workspace.id]);

  // Auto-refresh execution list while any execution is running/pending
  const runningCount = executions.filter(
    (e) => e.status === "running" || e.status === "pending",
  ).length;
  useEffect(() => {
    if (runningCount === 0) return;
    const interval = setInterval(fetchExecutions, 3000);
    return () => clearInterval(interval);
  }, [runningCount]);

  // Sync selectedExecution when the list updates (e.g. status change)
  useEffect(() => {
    if (!selectedExecution) return;
    const updated = executions.find((e) => e.id === selectedExecution.id);
    if (updated && JSON.stringify(updated) !== JSON.stringify(selectedExecution)) {
      setSelectedExecution(updated);
    }
  }, [executions]);

  // Poll progress for ALL running executions (feeds both list rows and detail panel)
  useEffect(() => {
    const runningExecs = executions.filter((e) => e.status === "running");
    if (runningExecs.length === 0) return;

    const fetchAllProgress = async () => {
      await Promise.all(
        runningExecs.map(async (exec) => {
          try {
            const res = await fetch(
              `http://localhost:8000/api/workspaces/${workspace.id}/executions/${exec.id}/progress`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (res.ok) {
              const data = await res.json();
              setExecutionProgress((prev) => ({
                ...prev,
                [exec.id]: data.progress,
              }));
            }
          } catch (e) {
            console.error("Progress poll error:", e);
          }
        }),
      );
    };

    fetchAllProgress();
    const interval = setInterval(fetchAllProgress, 2000);
    return () => clearInterval(interval);
    // Re-run when the set of running execution ids changes
  }, [executions.map((e) => `${e.id}:${e.status}`).join(",")]);

  const fetchAllResources = async () => {
    const [m, d, p] = await Promise.all([
      fetchData("models"),
      fetchData("datasets"),
      fetchData("preprocessing"),
    ]);
    setModels(m);
    setDatasets(d);
    setPreprocessings(p);
  };

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setExecutions(data);

        // If initialExecutionId is provided, select it automatically
        if (initialExecutionId) {
          const targetExec = data.find(
            (e) => e.id === initialExecutionId || e._id === initialExecutionId,
          );
          if (targetExec) {
            setSelectedExecution(targetExec);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (type) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/${type}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const handleStartWizard = async () => {
    setView("create");
    setActiveStep(1);
    setSelectedModel(null);
    setSelectedDataset(null);
    setSelectedPreprocessing(null);

    // Predownload data potentially needed (or load lazily in steps)
    const [m, d, p] = await Promise.all([
      fetchData("models"),
      fetchData("datasets"),
      fetchData("preprocessing"),
    ]);
    setModels(m);
    setDatasets(d);
    setPreprocessings(p);
  };

  const handleRunExecution = async () => {
    try {
      const payload = {
        model_id: selectedModel.id || selectedModel._id,
        dataset_id: selectedDataset.id || selectedDataset._id,
        preprocessing_id: selectedPreprocessing
          ? selectedPreprocessing.id || selectedPreprocessing._id
          : null,
        config: config,
      };

      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const newExecution = await res.json();
        setExecutions((prev) => [newExecution, ...prev]);
        setView("list");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelExecution = async (executionId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "Are you sure you want to cancel this execution? This action cannot be undone.",
      "Cancel Execution",
      "warning",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions/${executionId}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        fetchExecutions();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert(data.detail || "Could not cancel execution.", "Cancel Failed", "error");
      }
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleDownloadReport = async (executionId) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions/${executionId}/report`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `execution_report_${executionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        showAlert(
          "Report not available yet. Please try again later.",
          "Report Error",
          "error",
        );
      }
    } catch (err) {
      console.error("Failed to download report:", err);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <div
                key={model._id}
                onClick={() => setSelectedModel(model)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedModel?._id === model._id
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded text-blue-600">
                    <FiCpu />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{model.name}</h4>
                    <span className="text-xs text-gray-500">
                      {model.format}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {model.description}
                </p>
              </div>
            ))}
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets.map((dataset) => (
              <div
                key={dataset._id}
                onClick={() => setSelectedDataset(dataset)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedDataset?._id === dataset._id
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-100 rounded text-indigo-600">
                    <FiDatabase />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {dataset.name}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {dataset.type}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {dataset.description}
                </p>
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <div
              onClick={() => setSelectedPreprocessing(null)}
              className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center gap-4 ${
                selectedPreprocessing === null
                  ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                  : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
              }`}
            >
              <div className="p-2 bg-gray-100 rounded text-gray-600">
                <FiActivity />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">None (Raw Data)</h4>
                <p className="text-sm text-gray-500">
                  Use dataset without additional preprocessing
                </p>
              </div>
            </div>

            {preprocessings.map((prep) => (
              <div
                key={prep.id}
                onClick={() => setSelectedPreprocessing(prep)}
                className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center gap-4 ${
                  selectedPreprocessing?.id === prep.id
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                }`}
              >
                <div className="p-2 bg-orange-100 rounded text-orange-600">
                  <FiLayers />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{prep.name}</h4>
                  <p className="text-sm text-gray-500">
                    {prep.mode === "ui"
                      ? `${prep.steps?.length || 0} steps`
                      : "Custom Code"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        );
      case 4:
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center mb-6 pb-4 border-b border-gray-100">
                <div className="p-2 bg-gray-100 rounded-lg text-gray-600 mr-3">
                  <FiSettings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Configuration
                  </h3>
                  <p className="text-sm text-gray-500">
                    Configure parameters for the model execution.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Batch Size */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Size
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <input
                      type="number"
                      min="1"
                      value={config.batch_size}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          batch_size: parseInt(e.target.value),
                        })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Number of samples processed in one pass.
                  </p>
                </div>

                {/* Device */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Compute Device
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <select
                      value={config.device}
                      onChange={(e) =>
                        setConfig({ ...config, device: e.target.value })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    >
                      <option value="cpu">CPU</option>
                      <option value="cuda">CUDA (GPU) ★</option>
                      <option value="mps">MPS (Mac)</option>
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Hardware accelerator for the execution.
                  </p>
                </div>

                {/* Shuffle Dataset */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shuffle Dataset
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, shuffle_dataset: !config.shuffle_dataset })
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                      config.shuffle_dataset ? "bg-primary-600" : "bg-gray-200"
                    }`}
                    role="switch"
                    aria-checked={config.shuffle_dataset}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        config.shuffle_dataset ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <p className="mt-1 text-xs text-gray-500">
                    Randomly shuffle dataset samples before inference. Recommended for unbiased evaluation.
                  </p>
                </div>

                {/* Sample Limit */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Process Samples Limit
                  </label>
                  <div className="flex rounded-md shadow-sm">
                    <input
                      type="number"
                      min="0"
                      placeholder="All"
                      value={config.limit_samples || ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          limit_samples:
                            e.target.value === ""
                              ? 0
                              : parseInt(e.target.value),
                        })
                      }
                      className="flex-1 block w-full rounded-none rounded-l-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2 pl-3 border"
                    />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                      / {selectedDataset?.file_count || "unknown"} samples
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty or 0 to process the entire dataset.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start">
              <FiAlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
              <p>
                Running on <b>{config.device.toUpperCase()}</b>. Ensure your
                backend worker supports this device type. Using GPU
                significantly accelerates inference time for large datasets.
              </p>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Execution Summary
            </h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Model</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedModel?.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Dataset</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedDataset?.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Preprocessing
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedPreprocessing?.name || "None"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Configuration
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <ul className="list-disc pl-5">
                    {Object.entries(config).map(([k, v]) => (
                      <li key={k}>
                        {k}: {v}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        );
      default:
        return null;
    }
  };

  if (view === "create") {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-6">
          <Button
            variant="ghost"
            onClick={() => setView("list")}
            className="mr-4"
          >
            <FiArrowLeft />
          </Button>
          <h2 className="text-xl font-bold text-gray-900">New Execution</h2>
        </div>

        <Stepper steps={EXECUTION_STEPS} currentStep={activeStep} />

        <div className="mt-8">{renderStepContent()}</div>

        <div className="mt-8 flex justify-between pt-6 border-t border-gray-100">
          <Button
            variant="secondary"
            onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
            disabled={activeStep === 1}
          >
            Back
          </Button>

          {activeStep < 5 ? (
            <Button
              onClick={() => setActiveStep(activeStep + 1)}
              disabled={
                (activeStep === 1 && !selectedModel) ||
                (activeStep === 2 && !selectedDataset)
              }
            >
              Next <FiArrowRight className="ml-2 inline" />
            </Button>
          ) : (
            <Button onClick={handleRunExecution} variant="primary">
              Run Execution <FiPlay className="ml-2 inline" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Executions</h2>
          <p className="text-sm text-gray-500">
            Manage and monitor your model inference runs
          </p>
        </div>
        {!isReadonly && (
          <Button
            onClick={handleStartWizard}
            disabled={executions.some(
              (e) => e.status === "running" || e.status === "pending",
            )}
            title={
              executions.some(
                (e) => e.status === "running" || e.status === "pending",
              )
                ? "An execution is already in progress"
                : undefined
            }
            className="flex items-center"
          >
            <FiPlay className="mr-2" /> New Execution
          </Button>
        )}
      </div>

      {executions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
          <FiTerminal className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            No executions yet
          </h3>
          <p className="text-gray-500 mb-6">
            Start a new execution to run inference with your models.
          </p>
          <Button onClick={handleStartWizard}>Start Execution</Button>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 transition-all duration-300 ease-in-out">
          <div
            className={`transition-all duration-300 ${
              selectedExecution ? "lg:w-1/2 xl:w-7/12" : "w-full"
            }`}
          >
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {!selectedExecution && (
                      <>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Dataset
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    {!selectedExecution && (
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Report
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {executions.map((exec) => (
                    <React.Fragment key={exec.id}>
                      <tr
                        onClick={() => {
                          setSelectedExecution(exec);
                          setShowFullError(false);
                        }}
                        className={`cursor-pointer transition-colors ${
                          selectedExecution?.id === exec.id
                            ? "bg-blue-50"
                            : "hover:bg-gray-50"
                        } ${exec.status === "running" ? "[&>td]:pb-0 [&>td]:pt-4" : ""}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${
                          exec.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : exec.status === "running"
                              ? "bg-blue-100 text-blue-800"
                              : exec.status === "failed" || exec.status === "cancelled"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                        }`}
                          >
                            {exec.status}
                          </span>
                        </td>
                        {!selectedExecution && (
                          <>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {models.find(
                                (m) => (m.id || m._id) === exec.model_id,
                              )?.name || exec.model_id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {datasets.find(
                                (d) => (d.id || d._id) === exec.dataset_id,
                              )?.name || exec.dataset_id}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {exec.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(exec.created_at).toLocaleString()}
                        </td>
                        {!selectedExecution && (
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            {exec.status === "completed" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadReport(exec.id);
                                }}
                                title="Download PDF Report"
                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                              >
                                <FiFileText size={18} />
                              </button>
                            )}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-3">
                            {(exec.status === "running" ||
                              exec.status === "pending") && (
                              <button
                                onClick={(e) =>
                                  handleCancelExecution(exec.id, e)
                                }
                                title="Cancel Execution"
                                className="text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <FiStopCircle size={16} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedExecution(exec);
                              }}
                              title="View Details"
                              className="text-primary-600 hover:text-primary-900"
                            >
                              <FiChevronRight size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {exec.status === "running" && (
                        <tr
                          style={{ borderTop: "none" }}
                          className={`cursor-pointer ${
                            selectedExecution?.id === exec.id
                              ? "bg-blue-50"
                              : ""
                          }`}
                          onClick={() => {
                            setSelectedExecution(exec);
                            setShowFullError(false);
                          }}
                        >
                          <td className="px-6 pb-3" />
                          <td
                            colSpan={!selectedExecution ? 4 : 2}
                            className="px-6 pt-1.5 pb-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-primary-600 h-1.5 rounded-full transition-all duration-500 ease-out"
                                  style={{
                                    width: `${executionProgress[exec.id] ?? 0}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-gray-400 font-mono w-7 text-right shrink-0">
                                {executionProgress[exec.id] ?? 0}%
                              </span>
                            </div>
                          </td>
                          {!selectedExecution && <td className="pb-3" />}
                          <td className="px-6 pb-3" />
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedExecution && (
            <div className="lg:w-1/2 xl:w-5/12 animate-fade-in-up md:animate-slide-in-right">
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden sticky top-6">
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <FiTerminal className="text-gray-500" />
                      Execution Details
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ml-2
                          ${
                            selectedExecution.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : selectedExecution.status === "running"
                                ? "bg-blue-100 text-blue-800"
                                : selectedExecution.status === "failed" || selectedExecution.status === "cancelled"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                      >
                        {selectedExecution.status}
                      </span>
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 ml-6 font-mono">
                      ID: {selectedExecution.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(selectedExecution.status === "running" ||
                      selectedExecution.status === "pending") && (
                      <button
                        onClick={(e) =>
                          handleCancelExecution(selectedExecution.id, e)
                        }
                        title="Cancel Execution"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiStopCircle size={18} />
                      </button>
                    )}
                    {selectedExecution.status === "completed" && (
                      <button
                        onClick={() =>
                          handleDownloadReport(selectedExecution.id)
                        }
                        title="Download PDF Report"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiFileText size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedExecution(null)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      <FiX size={18} />
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {/* Progress Bar — visible while running/pending */}
                  {(selectedExecution.status === "running" ||
                    selectedExecution.status === "pending") && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span className="font-medium">
                          {selectedExecution.status === "pending"
                            ? "Waiting to start…"
                            : "Processing…"}
                        </span>
                        <span className="font-mono">
                          {executionProgress[selectedExecution.id] ?? 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary-600 h-2 rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: `${
                              selectedExecution.status === "pending"
                                ? 0
                                : (executionProgress[selectedExecution.id] ?? 0)
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Model Info */}
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Model</p>
                      <p className="text-sm font-medium text-gray-900">
                        {models.find(
                          (m) => (m.id || m._id) === selectedExecution.model_id,
                        )?.name || selectedExecution.model_id}
                      </p>
                    </div>

                    {/* Dataset Info */}
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Dataset</p>
                      <p className="text-sm font-medium text-gray-900">
                        {datasets.find(
                          (d) =>
                            (d.id || d._id) === selectedExecution.dataset_id,
                        )?.name || selectedExecution.dataset_id}
                      </p>
                    </div>

                    {/* Preprocessing Info */}
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">
                        Preprocessing
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedExecution.preprocessing_id
                          ? preprocessings.find(
                              (p) =>
                                (p.id || p._id) ===
                                selectedExecution.preprocessing_id,
                            )?.name || "Unknown"
                          : "None (Raw Data)"}
                      </p>
                    </div>

                    {/* Created At Info */}
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Created At</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(
                          selectedExecution.created_at,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Error Message */}
                  {selectedExecution.status === "failed" &&
                    selectedExecution.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 animate-fade-in-up">
                        <h5 className="text-sm font-medium text-red-800 mb-2 flex items-center">
                          <FiAlertCircle className="mr-2" /> Error Details
                        </h5>
                        <p
                          className={`text-sm text-red-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-red-100 ${
                            !showFullError && "line-clamp-3"
                          }`}
                        >
                          {selectedExecution.error_message}
                        </p>
                        {selectedExecution.error_message &&
                          selectedExecution.error_message.length > 200 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowFullError(!showFullError);
                              }}
                              className="text-xs text-red-600 font-medium mt-2 hover:underline focus:outline-none"
                            >
                              {showFullError ? "Show Less" : "Show More"}
                            </button>
                          )}
                      </div>
                    )}

                  {/* Config */}
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                      <FiSettings className="mr-2" /> Configuration
                    </h5>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-2 gap-px bg-gray-200">
                        {/* Dataset Size */}
                        <div className="bg-white px-3 py-2">
                          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-0.5">
                            Dataset Size
                          </p>
                          <p className="text-xs text-gray-900 font-mono">
                            {selectedExecution.metrics?.dataset_size ||
                              "Unknown"}
                          </p>
                        </div>

                        {/* Config Items */}
                        {Object.entries(selectedExecution.config || {}).map(
                          ([key, value]) => (
                            <div key={key} className="bg-white px-3 py-2">
                              <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-0.5">
                                {key.replace(/_/g, " ")}
                              </p>
                              <p
                                className="text-xs text-gray-900 font-mono truncate"
                                title={
                                  typeof value === "object"
                                    ? JSON.stringify(value)
                                    : String(value)
                                }
                              >
                                {typeof value === "object"
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                      <FiActivity className="mr-2" /> Metrics
                    </h5>
                    {selectedExecution.metrics &&
                    Object.keys(selectedExecution.metrics).length > 0 ? (
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {Object.entries(selectedExecution.metrics)
                          .filter(
                            ([key]) =>
                              key !== "dataset_size" &&
                              key !== "processed_samples" &&
                              key !== "confusion_matrix" &&
                              key !== "confusion_matrix_labels" &&
                              key !== "class_accuracy_top3" &&
                              key !== "class_accuracy_bottom3" &&
                              key !== "topk_accuracies",
                          )
                          .sort((a, b) => {
                            const order = [
                              "accuracy",
                              "top5_accuracy",
                              "loss",
                              "precision",
                              "recall",
                              "f1_score",
                            ];
                            const idxA = order.indexOf(a[0]);
                            const idxB = order.indexOf(b[0]);
                            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                            if (idxA !== -1) return -1;
                            if (idxB !== -1) return 1;
                            return 0;
                          })
                          .map(([key, value]) => (
                            <div
                              key={key}
                              className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm"
                            >
                              <p
                                className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1 truncate"
                                title={key === "emissions" ? "CO2 Emissions (g)" : key === "emissions_per_min" ? "Emissions / Min (g)" : key.replace(/_/g, " ")}
                              >
                                {key === "emissions" ? "CO2 Emissions (g)" : key === "emissions_per_min" ? "Emissions / Min (g)" : key.replace(/_/g, " ")}
                              </p>
                              <p className="text-lg font-bold text-primary-600">
                                {key === "emissions" || key === "emissions_per_min"
                                  ? (typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value))
                                  : typeof value === "number"
                                  ? value.toLocaleString(undefined, {
                                      maximumFractionDigits: 2,
                                    })
                                  : String(value)}
                              </p>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-white rounded-lg border border-gray-200 border-dashed">
                        <FiActivity className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">
                          No metrics available yet
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Top-K Accuracy Bar Chart */}
                  {selectedExecution.metrics?.topk_accuracies &&
                    Object.keys(selectedExecution.metrics.topk_accuracies).length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                        <FiActivity className="mr-2" /> Top-K Accuracy
                      </h5>
                      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
                        {Object.entries(selectedExecution.metrics.topk_accuracies)
                          .sort((a, b) => Number(a[0]) - Number(b[0]))
                          .map(([k, acc]) => (
                            <div key={k} className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-gray-500 w-12 flex-shrink-0">
                                Top-{k}
                              </span>
                              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                  className="bg-indigo-500 h-3 rounded-full transition-all duration-500"
                                  style={{ width: `${(Number(acc) * 100).toFixed(1)}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-indigo-700 w-12 text-right tabular-nums">
                                {(Number(acc) * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Class-wise Accuracy Bar Chart */}
                  {(selectedExecution.metrics?.class_accuracy_top3?.length > 0 ||
                    selectedExecution.metrics?.class_accuracy_bottom3?.length > 0) && (
                    <div className="mt-4">
                      <h5 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                        <FiActivity className="mr-2" /> Class-wise Accuracy
                      </h5>
                      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
                        {[{
                          label: "\u2B06 Top classes",
                          items: selectedExecution.metrics.class_accuracy_top3 || [],
                          barColor: "bg-emerald-500",
                          textColor: "text-emerald-700",
                        }, {
                          label: "\u2B07 Bottom classes",
                          items: selectedExecution.metrics.class_accuracy_bottom3 || [],
                          barColor: "bg-red-400",
                          textColor: "text-red-700",
                        }].map(({ label, items, barColor, textColor }) =>
                          items.length > 0 && (
                            <div key={label}>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label}</p>
                              <div className="space-y-2">
                                {items.map((item) => (
                                  <div key={item.label} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600 w-24 truncate flex-shrink-0" title={item.label}>
                                      {item.label}
                                    </span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                      <div
                                        className={`${barColor} h-3 rounded-full transition-all duration-500`}
                                        style={{ width: `${(item.accuracy * 100).toFixed(1)}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs font-semibold w-12 text-right tabular-nums ${textColor}`}>
                                      {(item.accuracy * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExecutionTab;
