import React, { useState, useEffect, useCallback } from "react";
import { Stepper, Button } from "../common";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import {
  FiCpu,
  FiDatabase,
  FiLayers,
  FiSettings,
  FiArrowLeft,
  FiArrowRight,
  FiZap,
  FiActivity,
  FiAlertCircle,
  FiSliders,
  FiX,
  FiCheckCircle,
  FiClock,
  FiLoader,
  FiTrendingDown,
  FiChevronDown,
  FiChevronUp,
  FiChevronRight,
  FiStopCircle,
  FiFileText,
  FiTarget,
  FiEyeOff,
  FiTrash2,
} from "react-icons/fi";

const QUANTIZATION_STEPS = [
  { id: 1, title: "Select Model" },
  { id: 2, title: "Select Dataset" },
  { id: 3, title: "Quantization Type" },
  { id: 4, title: "Configuration" },
  { id: 5, title: "Review & Create" },
];

const QUANTIZATION_TYPES = [
  {
    value: "dynamic",
    label: "Dynamic Quantization",
    description: "Fastest method. Quantizes weights only. Best for LSTM, RNN models. No dataset required.",
    requiresDataset: false,
  },
  {
    value: "static",
    label: "Static Quantization (PTQ)",
    description: "Quantizes both weights and activations. Best for CNN models. Requires calibration dataset.",
    requiresDataset: true,
  },
  {
    value: "qat",
    label: "Quantization Aware Training (QAT)",
    description: "Most accurate. Trains model with quantization simulation. Requires training dataset.",
    requiresDataset: true,
  },
];

const UNSUPPORTED_FORMATS = ["onnx", "torchscript"];

const StatusBadge = ({ status }) => {
  const map = {
    completed: "bg-green-100 text-green-800",
    running: "bg-blue-100 text-blue-800 animate-pulse",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
};

const QuantizationSubTab = ({ workspace, isReadonly = false }) => {
  const { token } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const [view, setView] = useState("list"); // "list" | "create"
  const [quantizations, setQuantizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuantization, setSelectedQuantization] = useState(null);
  const [creating, setCreating] = useState(false);

  // Wizard state
  const [activeStep, setActiveStep] = useState(1);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null); // null = no dataset
  const [selectedPreprocessing, setSelectedPreprocessing] = useState(null);
  const [quantizationType, setQuantizationType] = useState("dynamic");
  const [config, setConfig] = useState({
    dtype: "qint8",
    backend: "fbgemm",
    layer_types: ["Linear"],
    calibration_samples: 100,
    calibration_method: "minmax",
    epochs: 5,
    learning_rate: 0.0001,
    batch_size: 32,
    output_format: "state_dict",
    output_name_suffix: "_quantized",
    device: "cpu",
  });

  // Live progress map for running/pending quantizations: { [id]: { progress, message } }
  const [quantProgress, setQuantProgress] = useState({});

  // Resource lists
  const [models, setModels] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [preprocessings, setPreprocessings] = useState([]);

  const workspaceId = workspace?.id || workspace?._id;

  const fetchData = useCallback(
    async (type) => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/workspaces/${workspaceId}/${type}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) return await res.json();
      } catch {
        /* ignore */
      }
      return [];
    },
    [workspaceId, token],
  );

  const fetchQuantizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setQuantizations(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    if (workspaceId) {
      fetchQuantizations();
      Promise.all([
        fetchData("models"),
        fetchData("datasets"),
        fetchData("preprocessing"),
      ]).then(([m, d, p]) => {
        setModels(m);
        setDatasets(d);
        setPreprocessings(p);
      });
    }
  }, [workspaceId]);

  // Auto-refresh running quantizations
  useEffect(() => {
    const hasRunning = quantizations.some(
      (o) => o.status === "pending" || o.status === "running",
    );
    if (!hasRunning) return;
    const interval = setInterval(fetchQuantizations, 4000);
    return () => clearInterval(interval);
  }, [quantizations, fetchQuantizations]);

  // Poll /progress for all running/pending quantizations
  useEffect(() => {
    const running = quantizations.filter(
      (o) => o.status === "pending" || o.status === "running",
    );
    if (running.length === 0) return;

    const poll = async () => {
      const updates = {};
      await Promise.all(
        running.map(async (o) => {
          const optId = o.id || o._id;
          try {
            const res = await fetch(
              `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${optId}/progress`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (res.ok) {
              const data = await res.json();
              updates[optId] = { progress: data.progress ?? 0, message: data.message ?? "" };
            }
          } catch {
            /* ignore transient errors */
          }
        }),
      );
      setQuantProgress((prev) => ({ ...prev, ...updates }));
    };

    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [quantizations, workspaceId, token]);

  const handleStartWizard = () => {
    setView("create");
    setActiveStep(1);
    setSelectedModel(null);
    setSelectedDataset(null);
    setSelectedPreprocessing(null);
    setQuantizationType("dynamic");
    setConfig({
      dtype: "qint8",
      backend: "fbgemm",
      layer_types: ["Linear"],
      calibration_samples: 100,
      calibration_method: "minmax",
      epochs: 5,
      learning_rate: 0.0001,
      batch_size: 32,
      output_format: "state_dict",
      output_name_suffix: "_quantized",
      device: "cpu",
    });
  };

  const handleCreateQuantization = async () => {
    setCreating(true);
    try {
      const payload = {
        model_id: selectedModel.id || selectedModel._id,
        dataset_id: selectedDataset
          ? selectedDataset.id || selectedDataset._id
          : null,
        preprocessing_id: selectedPreprocessing
          ? selectedPreprocessing.id || selectedPreprocessing._id
          : null,
        type: quantizationType,
        config,
      };

      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations`,
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
        const newOpt = await res.json();
        setQuantizations((prev) => [newOpt, ...prev]);
        setView("list");
        showAlert("Quantization started successfully!", "Success", "success");
      } else {
        const err = await res.json();
        showAlert(
          err.detail || "Failed to start quantization",
          "Error",
          "error",
        );
      }
    } catch (err) {
      console.error(err);
      showAlert("Failed to start quantization", "Error", "error");
    } finally {
      setCreating(false);
    }
  };

  const canProceed = () => {
    if (activeStep === 1) return !!selectedModel;
    if (activeStep === 2) {
      const typeInfo = QUANTIZATION_TYPES.find((t) => t.value === quantizationType);
      return !typeInfo?.requiresDataset || !!selectedDataset;
    }
    return true;
  };

  const handleCancelQuantization = async (optimizationId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "Are you sure you want to cancel this quantization? This action cannot be undone.",
      "Cancel quantization",
      "warning",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${optimizationId}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        fetchQuantizations();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert(data.detail || "Could not cancel quantization.", "Cancel Failed", "error");
      }
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleDeleteQuantization = async (quantizationId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "This quantization and all its data will be permanently deleted. This action cannot be undone.",
      "Delete Quantization",
      "danger",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${quantizationId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok || res.status === 204) {
        setQuantizations((prev) => prev.filter((o) => (o.id || o._id) !== quantizationId));
        if ((selectedQuantization?.id || selectedQuantization?._id) === quantizationId)
          setSelectedQuantization(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert(data.detail || "Could not delete quantization.", "Delete Failed", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ------------------------------------------------------------------ //
  // Wizard step renderers
  // ------------------------------------------------------------------ //

  const renderStep1 = () => (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Select the model to optimize. Only PyTorch models (
        <span className="font-medium">full_model, state_dict, safetensors</span>
        ) are supported. ONNX and TorchScript models cannot be pruned.
      </p>
      {models.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border border-dashed border-gray-300 rounded-lg">
          <FiCpu className="mx-auto mb-2 h-8 w-8" />
          <p>No models in this workspace yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => {
            const unsupported = UNSUPPORTED_FORMATS.includes(
              model.format?.toLowerCase(),
            );
            const isSelected = selectedModel?._id === model._id;
            return (
              <div
                key={model._id}
                onClick={() => !unsupported && setSelectedModel(model)}
                className={`p-4 border rounded-lg transition-all ${
                  unsupported
                    ? "opacity-50 cursor-not-allowed border-gray-200 bg-gray-50"
                    : isSelected
                      ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500 cursor-pointer"
                      : "border-gray-200 hover:border-primary-300 hover:bg-gray-50 cursor-pointer"
                }`}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded text-blue-600 flex-shrink-0">
                    <FiCpu />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-gray-900 truncate">
                        {model.name}
                      </h4>
                      {model.is_optimized && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                          Optimized
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">{model.format}</span>
                    {unsupported && (
                      <p className="text-xs text-red-500 mt-1">
                        Not supported for quantization
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 h-10">
                  {model.description || "No description."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Select a dataset to use for calibration and performance benchmarking.
        Dataset samples will be used to measure real inference latency and throughput,
        and for importance score computation when applicable.
      </p>
      {datasets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-3">
          <FiDatabase className="mb-3 h-10 w-10" />
          <p className="text-sm font-medium">No datasets available</p>
          <p className="text-xs mt-1">Upload a dataset first to continue.</p>
        </div>
      )}
      <div className="space-y-3">
        {datasets.map((dataset) => (
          <div
            key={dataset._id}
            onClick={() => setSelectedDataset(dataset)}
            className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center gap-4 ${
              selectedDataset?._id === dataset._id
                ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
            }`}
          >
            <div className="p-2 bg-indigo-100 rounded text-indigo-600">
              <FiDatabase />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">{dataset.name}</h4>
              <p className="text-sm text-gray-500">
                {dataset.file_count} files · {dataset.classes?.length || 0}{" "}
                classes
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Select quantization type based on your use case and requirements.
      </p>
      <div className="space-y-3">
        {QUANTIZATION_TYPES.map((type) => (
          <div
            key={type.value}
            onClick={() => setQuantizationType(type.value)}
            className={`p-4 border rounded-lg cursor-pointer transition-all ${
              quantizationType === type.value
                ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded ${
                quantizationType === type.value
                  ? "bg-primary-100 text-primary-600"
                  : "bg-gray-100 text-gray-600"
              }`}>
                <FiCpu />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{type.label}</h4>
                <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                {type.requiresDataset && !selectedDataset && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                    <FiAlertCircle className="w-3 h-3" />
                    <span>Requires dataset (previous step)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center mb-6 pb-4 border-b border-gray-100">
          <div className="p-2 bg-gray-100 rounded-lg text-gray-600 mr-3">
            <FiSliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">Configuration</h3>
            <p className="text-sm text-gray-500">
              Configure quantization parameters
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Type</label>
            <select value={config.dtype} onChange={(e) => setConfig({ ...config, dtype: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2">
              <option value="qint8">int8 (recommended)</option>
              <option value="float16">float16</option>
            </select>
          </div>
          {(quantizationType === 'static' || quantizationType === 'qat') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Backend</label>
              <select value={config.backend} onChange={(e) => setConfig({ ...config, backend: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="fbgemm">fbgemm (server CPU)</option>
                <option value="qnnpack">qnnpack (mobile/ARM)</option>
              </select>
            </div>
          )}
          {quantizationType === 'static' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Calibration Samples</label>
              <input type="number" value={config.calibration_samples} onChange={(e) => setConfig({ ...config, calibration_samples: parseInt(e.target.value) })} className="block w-full rounded-md border border-gray-300 px-3 py-2" min="1" />
            </div>
          )}
          {quantizationType === 'qat' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training Epochs</label>
                <input type="number" value={config.epochs} onChange={(e) => setConfig({ ...config, epochs: parseInt(e.target.value) })} className="block w-full rounded-md border border-gray-300 px-3 py-2" min="1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning Rate</label>
                <input type="number" step="0.0001" value={config.learning_rate} onChange={(e) => setConfig({ ...config, learning_rate: parseFloat(e.target.value) })} className="block w-full rounded-md border border-gray-300 px-3 py-2" />
              </div>
            </>
          )}
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Output Model Name Suffix</label>
            <input type="text" value={config.output_name_suffix} onChange={(e) => setConfig({ ...config, output_name_suffix: e.target.value })} className="block w-full rounded-md border border-gray-300 px-3 py-2" placeholder="_quantized" />
          </div>
        </div>
      </div>
    </div>
  );


  const renderStep5 = () => (
    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-6">Quantization Summary</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-1">Model</dt>
          <dd className="text-sm font-medium text-gray-900">{selectedModel?.name} <span className="text-xs text-gray-500">({selectedModel?.format})</span></dd>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-1">Dataset</dt>
          <dd className="text-sm font-medium text-gray-900">{selectedDataset?.name || "None"}</dd>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-1">Quantization Type</dt>
          <dd className="text-sm font-medium text-gray-900">{QUANTIZATION_TYPES.find(t => t.value === quantizationType)?.label}</dd>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-1">Output Model Name</dt>
          <dd className="text-sm font-medium text-primary-600 font-mono">{selectedModel?.name}{config.output_name_suffix}</dd>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100 sm:col-span-2">
          <dt className="text-xs font-semibold text-gray-500 uppercase mb-2">Configuration</dt>
          <dd>
            <ul className="grid grid-cols-2 gap-2 text-sm text-gray-900">
              <li><span className="text-gray-500">Data Type: </span>{config.dtype}</li>
              {(quantizationType === 'static' || quantizationType === 'qat') && <li><span className="text-gray-500">Backend: </span>{config.backend}</li>}
              {quantizationType === 'static' && <li><span className="text-gray-500">Calibration Samples: </span>{config.calibration_samples}</li>}
              {quantizationType === 'qat' && (
                <>
                  <li><span className="text-gray-500">Epochs: </span>{config.epochs}</li>
                  <li><span className="text-gray-500">Learning Rate: </span>{config.learning_rate}</li>
                </>
              )}
              <li><span className="text-gray-500">Device: </span>{config.device.toUpperCase()}</li>
            </ul>
          </dd>
        </div>
      </dl>
    </div>
  );

  const renderStepContent = () => {
    switch (activeStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      case 5:
        return renderStep5();
      default:
        return null;
    }
  };

  // ------------------------------------------------------------------ //
  // Wizard view
  // ------------------------------------------------------------------ //
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
          <h2 className="text-xl font-bold text-gray-900">
            New Network quantization
          </h2>
        </div>

        <Stepper steps={QUANTIZATION_STEPS} currentStep={activeStep} />

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
              disabled={!canProceed()}
            >
              Next <FiArrowRight className="ml-2 inline" />
            </Button>
          ) : (
            <Button
              onClick={handleCreateQuantization}
              variant="primary"
              disabled={creating}
            >
              {creating ? (
                <>
                  <FiLoader className="mr-2 inline animate-spin" /> StartingÔÇĞ
                </>
              ) : (
                <>
                  <FiZap className="mr-2 inline" /> Create Quantized Model
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ //
  // List view
  // ------------------------------------------------------------------ //
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Network quantization
          </h2>
          <p className="text-sm text-gray-500">
            Reduce model precision (float32 → int8) for faster inference
          </p>
        </div>
        {!isReadonly && (
          <Button
            onClick={handleStartWizard}
            disabled={quantizations.some(
              (o) => o.status === "running" || o.status === "pending",
            )}
            title={
              quantizations.some(
                (o) => o.status === "running" || o.status === "pending",
              )
                ? "A quantization is already in progress"
                : undefined
            }
            className="flex items-center"
          >
            <FiZap className="mr-2" /> Create Quantized Model
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!loading && quantizations.length === 0 && (
        <div className="text-center py-14 bg-white rounded-lg border border-gray-200 border-dashed">
          <FiTrendingDown className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            No quantizations yet
          </h3>
          <p className="text-gray-500 mb-6">
            Quantize your models to reduce size and improve inference speed.
          </p>
          <Button onClick={handleStartWizard}>Create Quantized Model</Button>
        </div>
      )}

      {loading && quantizations.length === 0 && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}

      {/* List + detail */}
      {quantizations.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6 transition-all duration-300 ease-in-out">
          {/* Table */}
          <div
            className={`transition-all duration-300 ${
              selectedQuantization ? "lg:w-1/2 xl:w-7/12" : "w-full"
            }`}
          >
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {!selectedQuantization && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Model
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created Model
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {quantizations.map((opt) => {
                    const optId = opt.id || opt._id;
                    const isRunning = opt.status === "pending" || opt.status === "running";
                    const prog = quantProgress[optId];
                    return (
                    <React.Fragment key={opt.id}>
                    <tr
                      onClick={() => setSelectedQuantization(opt)}
                      className={`cursor-pointer transition-colors ${
                        selectedQuantization?.id === opt.id
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={opt.status} />
                      </td>
                      {!selectedQuantization && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {models.find(
                            (m) => (m.id || m._id) === opt.model_id,
                          )?.name || opt.model_id}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 max-w-[200px] truncate" title={opt.result?.output_model_name || "-"}>
                        {opt.result?.output_model_name || (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(opt.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          {(opt.status === "running" || opt.status === "pending") && (
                            <button
                              onClick={(e) => handleCancelQuantization(opt.id, e)}
                              title="Cancel quantization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiStopCircle size={16} />
                            </button>
                          )}
                          {(opt.status === "completed" ||
                            opt.status === "failed" ||
                            opt.status === "cancelled") && (
                            <button
                              onClick={(e) => handleDeleteQuantization(opt.id, e)}
                              title="Delete Quantization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuantization(opt);
                            }}
                            title="View Details"
                            className="text-primary-600 hover:text-primary-900"
                          >
                            <FiChevronRight size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isRunning && prog && (
                      <tr
                        style={{ borderTop: "none" }}
                        className={`cursor-pointer ${selectedQuantization?.id === optId ? "bg-blue-50" : ""}`}
                        onClick={() => setSelectedQuantization(opt)}
                      >
                        <td className="px-6 pb-3" />
                        <td
                          colSpan={!selectedQuantization ? 3 : 2}
                          className="px-6 pt-1.5 pb-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-primary-600 h-1.5 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${prog.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400 font-mono w-7 text-right shrink-0">
                              {prog.progress}%
                            </span>
                          </div>
                          {prog.message && (
                            <p className="text-[10px] text-gray-400 mt-1 truncate">{prog.message}</p>
                          )}
                        </td>
                        <td className="px-6 pb-3" />
                      </tr>
                    )}
                    </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          {selectedQuantization && (
            <div className="lg:w-1/2 xl:w-5/12 animate-fade-in">
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden sticky top-6">
                {/* Panel header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <FiZap className="text-gray-500" />
                      quantization Details
                      <StatusBadge status={selectedQuantization.status} />
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 ml-6 font-mono">
                      ID: {selectedQuantization.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(selectedQuantization.status === "running" ||
                      selectedQuantization.status === "pending") && (
                      <button
                        onClick={(e) =>
                          handleCancelQuantization(selectedQuantization.id, e)
                        }
                        title="Cancel quantization"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiStopCircle size={18} />
                      </button>
                    )}
                    {(selectedQuantization.status === "completed" ||
                      selectedQuantization.status === "failed" ||
                      selectedQuantization.status === "cancelled") && (
                      <button
                        onClick={(e) =>
                          handleDeleteQuantization(selectedQuantization.id, e)
                        }
                        title="Delete Quantization"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedQuantization(null)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      <FiX size={18} />
                    </button>
                  </div>
                </div>

                {/* Panel body */}
                <div className="p-4 space-y-5 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Model</p>
                      <p className="text-sm font-medium text-gray-900">
                        {models.find(
                          (m) =>
                            (m.id || m._id) === selectedQuantization.model_id,
                        )?.name || selectedQuantization.model_id}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Dataset</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedQuantization.dataset_id
                          ? datasets.find(
                              (d) =>
                                (d.id || d._id) ===
                                selectedQuantization.dataset_id,
                            )?.name || "Unknown"
                          : "None (Random)"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Created</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(
                          selectedQuantization.created_at,
                        ).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Completed</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedQuantization.completed_at
                          ? new Date(
                              selectedQuantization.completed_at,
                            ).toLocaleString()
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Config */}
                  <div>
                    <h5 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                      <FiSettings className="mr-2" /> Configuration
                    </h5>
                    <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-2 gap-px bg-gray-200">
                        {Object.entries(selectedQuantization.config || {}).map(
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
                                  ? Array.isArray(value)
                                    ? value.length === 0
                                      ? "none"
                                      : value.join(", ")
                                    : JSON.stringify(value)
                                  : String(value)}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error */}
                  {selectedQuantization.status === "failed" &&
                    selectedQuantization.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h5 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                          <FiAlertCircle /> Error Details
                        </h5>
                        <p className="text-sm text-red-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-red-100">
                          {selectedQuantization.error_message}
                        </p>
                      </div>
                    )}

                  {/* Results */}
                  {selectedQuantization.status === "completed" &&
                    Object.keys(selectedQuantization.result || {}).length >
                      0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <FiTrendingDown size={14} /> quantization Results
                        </h5>

                        {/* Output model name */}
                        {selectedQuantization.result.output_model_name && (
                          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                            <FiCheckCircle className="text-green-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-green-700 font-medium">
                                Quantized model saved:
                              </p>
                              <p className="text-sm font-mono text-green-800 font-bold">
                                {selectedQuantization.result.output_model_name}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Original Size */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Original Size
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(selectedQuantization.result.original_size_mb || 0).toFixed(2)} MB
                            </p>
                          </div>
                          {/* Quantized Size */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Quantized Size
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {(selectedQuantization.result.quantized_size_mb || 0).toFixed(2)} MB
                            </p>
                          </div>
                          {/* Compression Ratio */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Compression Ratio
                            </p>
                            <p className="text-base font-bold text-primary-600">
                              {(selectedQuantization.result.compression_ratio || 1.0).toFixed(2)}x
                            </p>
                            <p className="text-xs text-gray-400">
                              {((1 - (selectedQuantization.result.compression_ratio || 1.0)) * 100).toFixed(1)}% reduction
                            </p>
                          </div>
                          {/* Quantization Type */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Quantization Type
                            </p>
                            <p className="text-base font-bold text-gray-900 capitalize">
                              {selectedQuantization.result.quantization_type || 'N/A'}
                            </p>
                          </div>
                          {/* Dtype (for dynamic) */}
                          {selectedQuantization.result.dtype && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                                Data Type
                              </p>
                              <p className="text-base font-bold text-gray-900 font-mono">
                                {selectedQuantization.result.dtype}
                              </p>
                            </div>
                          )}
                          {/* Backend (for static/QAT) */}
                          {selectedQuantization.result.backend && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                                Backend
                              </p>
                              <p className="text-base font-bold text-gray-900 font-mono">
                                {selectedQuantization.result.backend}
                              </p>
                            </div>
                          )}
                          {/* Calibration samples (for static) */}
                          {selectedQuantization.result.calibration_samples && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                                Calibration Samples
                              </p>
                              <p className="text-base font-bold text-gray-900">
                                {selectedQuantization.result.calibration_samples}
                              </p>
                            </div>
                          )}
                          {/* Training epochs (for QAT) */}
                          {selectedQuantization.result.training_epochs && (
                            <div className="bg-white p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                                Training Epochs
                              </p>
                              <p className="text-base font-bold text-gray-900">
                                {selectedQuantization.result.training_epochs}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  {(selectedQuantization.status === "pending" ||
                    selectedQuantization.status === "running") && (
                    <div className="py-6 space-y-4">
                      <div className="flex items-center gap-3 text-gray-700">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 flex-shrink-0" />
                        <span className="text-sm font-medium">
                          {quantProgress[selectedQuantization.id || selectedQuantization._id]?.message || "quantization in progress\u2026"}
                        </span>
                        <span className="ml-auto text-sm font-semibold text-primary-600 tabular-nums">
                          {quantProgress[selectedQuantization.id || selectedQuantization._id]?.progress ?? 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-primary-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${quantProgress[selectedQuantization.id || selectedQuantization._id]?.progress ?? 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 text-center">
                        This page will update automatically.
                      </p>
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

export default QuantizationSubTab;


