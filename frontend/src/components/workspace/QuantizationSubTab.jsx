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
  FiChevronRight,
  FiStopCircle,
  FiFileText,
  FiTrash2,
  FiStar,
  FiMinimize2,
  FiMonitor,
} from "react-icons/fi";

const QUANTIZATION_STEPS = [
  { id: 1, title: "Select Model" },
  { id: 2, title: "Select Dataset" },
  { id: 3, title: "Preprocessing" },
  { id: 4, title: "Quantization Config" },
  { id: 5, title: "Review & Create" },
];

const QUANTIZATION_TYPES = [
  {
    value: "dynamic",
    label: "Dynamic",
    description: "Weights are quantized ahead of time, activations are quantized dynamically at runtime. Best for models with Linear/LSTM layers.",
  },
  {
    value: "static",
    label: "Static (PTQ)",
    description: "Both weights and activations are quantized using calibration data. Requires a dataset for calibration. Best for CNN models.",
  },
  {
    value: "weight_only",
    label: "Weight-only",
    description: "Only weights are quantized, activations remain in FP32. Good for memory-constrained deployments.",
  },
  {
    value: "float16",
    label: "FP16",
    description: "Converts all parameters to Float16. Requires GPU for efficient inference. ~2x memory reduction.",
  },
  {
    value: "bfloat16",
    label: "BF16",
    description: "Converts all parameters to BFloat16. Better numerical stability than FP16. Requires compatible GPU.",
  },
];

const BIT_WIDTH_OPTIONS = [
  { value: "int8", label: "INT8", description: "8-bit integer — best compression for CPU inference" },
  { value: "float16", label: "FP16", description: "16-bit float — best for GPU inference" },
];

const BACKEND_OPTIONS = [
  { value: "fbgemm", label: "FBGEMM", description: "Optimized for x86 CPUs (servers, desktops)" },
  { value: "qnnpack", label: "QNNPACK", description: "Optimized for ARM CPUs (mobile, edge devices)" },
  { value: "onednn", label: "oneDNN", description: "Intel oneDNN backend" },
];

const TARGET_LAYER_OPTIONS = [
  { value: "all", label: "All Layers (Entire Model)" },
  { value: "Linear", label: "Linear" },
  { value: "Conv2d", label: "Conv2d" },
  { value: "Conv1d", label: "Conv1d" },
  { value: "Conv3d", label: "Conv3d" },
  { value: "LSTM", label: "LSTM" },
  { value: "GRU", label: "GRU" },
  { value: "Embedding", label: "Embedding" },
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
  const [view, setView] = useState("list");
  const [quantizations, setQuantizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuantization, setSelectedQuantization] = useState(null);
  const [creating, setCreating] = useState(false);

  // Wizard state
  const [activeStep, setActiveStep] = useState(1);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedPreprocessing, setSelectedPreprocessing] = useState(null);
  const [config, setConfig] = useState({
    quantization_type: "dynamic",
    bit_width: "int8",
    backend: "fbgemm",
    target_layer_types: ["all"],
    per_channel: true,
    calibration_num_samples: 128,
    output_name_postfix: "_quant_int8",
    device: "cpu",
  });

  // Live progress
  const [quantProgress, setQuantProgress] = useState({});

  const [modelFilterFavorites, setModelFilterFavorites] = useState(false);
  const [modelFilterHideOptimized, setModelFilterHideOptimized] = useState(false);

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
      (q) => q.status === "pending" || q.status === "running",
    );
    if (!hasRunning) return;
    const interval = setInterval(fetchQuantizations, 4000);
    return () => clearInterval(interval);
  }, [quantizations, fetchQuantizations]);

  // Poll /progress
  useEffect(() => {
    const running = quantizations.filter(
      (q) => q.status === "pending" || q.status === "running",
    );
    if (running.length === 0) return;

    const poll = async () => {
      const updates = {};
      await Promise.all(
        running.map(async (q) => {
          const qId = q.id || q._id;
          try {
            const res = await fetch(
              `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${qId}/progress`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (res.ok) {
              const data = await res.json();
              updates[qId] = { progress: data.progress ?? 0, message: data.message ?? "" };
            }
          } catch {
            /* ignore */
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
    setConfig({
      quantization_type: "dynamic",
      bit_width: "int8",
      backend: "fbgemm",
      target_layer_types: ["all"],
      per_channel: true,
      calibration_num_samples: 128,
      output_name_postfix: "_quant_int8",
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
        const newQuant = await res.json();
        setQuantizations((prev) => [newQuant, ...prev]);
        setView("list");
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
    if (activeStep === 2) return true; // dataset is optional
    if (activeStep === 4) {
      if (config.quantization_type === "static" && !selectedDataset) return true; // warning shown, not blocked
    }
    return true;
  };

  const handleCancelQuantization = async (quantizationId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "Are you sure you want to cancel this quantization? This action cannot be undone.",
      "Cancel Quantization",
      "warning",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${quantizationId}/cancel`,
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
        setQuantizations((prev) => prev.filter((q) => (q.id || q._id) !== quantizationId));
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

  const handleDownloadReport = async (quantizationId, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/quantizations/${quantizationId}/report`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quantization_report_${quantizationId}.pdf`;
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

  // Helper: is FP16/BF16 mode
  const isFpMode = config.quantization_type === "float16" || config.quantization_type === "bfloat16";
  const isStaticMode = config.quantization_type === "static";
  const isDynamicOrWeightOnly = config.quantization_type === "dynamic" || config.quantization_type === "weight_only";

  // ------------------------------------------------------------------ //
  // Wizard step renderers
  // ------------------------------------------------------------------ //

  const renderStep1 = () => (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Select the model to quantize. Only PyTorch models (
        <span className="font-medium">full_model, state_dict, safetensors</span>
        ) are supported. ONNX and TorchScript models cannot be quantized.
      </p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setModelFilterFavorites((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            modelFilterFavorites
              ? "bg-yellow-50 border-yellow-300 text-yellow-700"
              : "bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100"
          }`}
        >
          <FiStar size={12} fill={modelFilterFavorites ? "currentColor" : "none"} />
          Favorites Only
        </button>
        <button
          type="button"
          onClick={() => setModelFilterHideOptimized((v) => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            modelFilterHideOptimized
              ? "bg-green-50 border-green-300 text-green-700"
              : "bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100"
          }`}
        >
          <FiZap size={12} />
          {modelFilterHideOptimized ? "Showing Original Only" : "Hide Optimized"}
        </button>
      </div>
      {models.length === 0 ? (
        <div className="text-center py-10 text-gray-400 border border-dashed border-gray-300 rounded-lg">
          <FiCpu className="mx-auto mb-2 h-8 w-8" />
          <p>No models in this workspace yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models
            .filter((m) => !modelFilterFavorites || m.is_favorite)
            .filter((m) => !modelFilterHideOptimized || !m.is_optimized)
            .map((model) => {
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
                      {model.is_favorite && <FiStar size={11} className="text-yellow-400 flex-shrink-0" fill="currentColor" />}
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
      <p className="text-sm text-gray-600 mb-2">
        Select a dataset for calibration (required for Static quantization) and performance benchmarking.
      </p>
      <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start gap-3 mb-4">
        <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Static (PTQ)</strong> quantization requires a calibration dataset.
          For <strong>Dynamic</strong> and <strong>Weight-only</strong>, a dataset is optional but
          recommended for accurate performance measurement.
        </p>
      </div>

      {/* Skip option */}
      <div
        onClick={() => setSelectedDataset(null)}
        className={`p-4 border rounded-lg cursor-pointer transition-all flex items-center gap-4 mb-3 ${
          selectedDataset === null
            ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
            : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
        }`}
      >
        <div className="p-2 bg-gray-100 rounded text-gray-600">
          <FiActivity />
        </div>
        <div>
          <h4 className="font-medium text-gray-900">No Dataset (Random Input)</h4>
          <p className="text-sm text-gray-500">Use random tensors for calibration and benchmarking</p>
        </div>
      </div>

      {datasets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300 mb-3">
          <FiDatabase className="mb-3 h-10 w-10" />
          <p className="text-sm font-medium">No datasets available</p>
          <p className="text-xs mt-1">Upload a dataset to enable calibration.</p>
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
                {dataset.file_count} files · {dataset.classes?.length || 0} classes
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      {selectedDataset ? (
        <>
          <p className="text-sm text-gray-600 mb-4">
            Select preprocessing to apply to dataset samples used for calibration.
          </p>
          <div className="space-y-3">
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
                <h4 className="font-medium text-gray-900">
                  Default (Resize 224×224 + ToTensor)
                </h4>
                <p className="text-sm text-gray-500">
                  Resize image to 224×224 and convert to tensor
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
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <FiLayers className="mb-3 h-10 w-10" />
          <p className="text-sm font-medium">No dataset selected</p>
          <p className="text-xs mt-1">
            Preprocessing is not applicable without a dataset.
          </p>
        </div>
      )}
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
            <h3 className="text-lg font-medium text-gray-900">
              Quantization Configuration
            </h3>
            <p className="text-sm text-gray-500">
              Configure PyTorch quantization parameters.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Quantization Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quantization Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {QUANTIZATION_TYPES.map((qt) => {
                const isSelected = config.quantization_type === qt.value;
                return (
                  <div
                    key={qt.value}
                    onClick={() => {
                      const newConfig = { ...config, quantization_type: qt.value };
                      // Auto-adjust postfix
                      if (qt.value === "float16" || qt.value === "bfloat16") {
                        newConfig.output_name_postfix = `_${qt.value}`;
                        newConfig.device = "cuda";
                      } else {
                        // Static quantization only supports INT8
                        if (qt.value === "static") {
                          newConfig.bit_width = "int8";
                        }
                        newConfig.output_name_postfix = `_quant_${newConfig.bit_width || config.bit_width}`;
                        newConfig.device = "cpu";
                      }
                      setConfig(newConfig);
                    }}
                    className={`p-3 border rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                        : "border-gray-200 hover:border-primary-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3 h-3 rounded-full border-2 ${
                        isSelected ? "border-primary-500 bg-primary-500" : "border-gray-300"
                      }`}>
                        {isSelected && <div className="w-1 h-1 bg-white rounded-full m-0.5" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{qt.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 ml-5">{qt.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Static mode warning if no dataset */}
          {isStaticMode && !selectedDataset && (
            <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200 flex items-start gap-3">
              <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Warning:</strong> Static quantization works best with a calibration dataset.
                Go back to Step 2 to select one, or random inputs will be used instead.
              </p>
            </div>
          )}

          {/* Dynamic / Weight-only CNN limitation warning */}
          {isDynamicOrWeightOnly && (
            <div className="p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200 flex items-start gap-3">
              <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Note:</strong>{" "}
                {config.quantization_type === "dynamic"
                  ? "Dynamic quantization only supports Linear, LSTM, and GRU layers."
                  : "Weight-only quantization only supports Linear layers."}{" "}
                CNN layers (Conv2d) will <strong>not</strong> be quantized. For CNN models, use <strong>Static (PTQ)</strong> instead.
              </p>
            </div>
          )}

          {/* FP16/BF16 GPU warning */}
          {isFpMode && (
            <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start gap-3">
              <FiMonitor className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>
                <strong>{config.quantization_type === "float16" ? "FP16" : "BF16"}</strong> quantization
                is most efficient on <strong>GPU (CUDA)</strong>. Running on CPU will be slower than the original model.
              </p>
            </div>
          )}

          {/* Bit Width and Backend - only for non-FP modes */}
          {!isFpMode && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bit Width */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bit Width
                </label>
                <select
                  value={config.bit_width}
                  onChange={(e) => {
                    const bw = e.target.value;
                    setConfig({
                      ...config,
                      bit_width: bw,
                      output_name_postfix: `_quant_${bw}`,
                    });
                  }}
                  className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  {BIT_WIDTH_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={isStaticMode && opt.value !== "int8"}
                    >
                      {opt.label} — {opt.description}
                      {isStaticMode && opt.value !== "int8" ? " (not supported for Static PTQ)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Backend - only for static */}
              {isStaticMode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantization Backend
                  </label>
                  <select
                    value={config.backend}
                    onChange={(e) => setConfig({ ...config, backend: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  >
                    {BACKEND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Target Layer Types - only for dynamic mode */}
          {config.quantization_type === "dynamic" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Layer Types
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TARGET_LAYER_OPTIONS.map((opt) => {
                  const isAll = opt.value === "all";
                  const allSelected = config.target_layer_types.includes("all");
                  const isSelected = isAll ? allSelected : config.target_layer_types.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary-300 bg-primary-50"
                          : "border-gray-200 hover:bg-gray-50"
                      } ${allSelected && !isAll ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={allSelected && !isAll}
                        onChange={() => {
                          if (isAll) {
                            setConfig({
                              ...config,
                              target_layer_types: allSelected ? ["Linear"] : ["all"],
                            });
                          } else {
                            const next = isSelected
                              ? config.target_layer_types.filter((v) => v !== opt.value)
                              : [...config.target_layer_types.filter((v) => v !== "all"), opt.value];
                            setConfig({
                              ...config,
                              target_layer_types: next.length === 0 ? ["all"] : next,
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Select which layer types to quantize. &quot;All Layers&quot; applies quantization to every supported layer type.
              </p>
            </div>
          )}

          {/* Per-Channel toggle - only for static */}
          {isStaticMode && (
            <div className="flex items-start justify-between gap-4 py-1">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Per-Channel Quantization
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Per-channel is more accurate but slightly slower. Per-tensor is faster but less precise.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, per_channel: !config.per_channel })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.per_channel ? "bg-primary-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    config.per_channel ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Calibration Samples - only for static */}
          {isStaticMode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Calibration Samples
              </label>
              <div className="flex rounded-md shadow-sm">
                <input
                  type="number"
                  min="16"
                  max="512"
                  value={config.calibration_num_samples}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      calibration_num_samples: Math.max(16, parseInt(e.target.value) || 128),
                    })
                  }
                  className="flex-1 block w-full rounded-none rounded-l-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2 pl-3 border"
                />
                <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                  / {selectedDataset?.file_count ?? "-"}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Number of dataset samples for activation range calibration. More samples = better accuracy but slower.
              </p>
            </div>
          )}

          {/* Compute Device */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Compute Device
              </label>
              <select
                value={config.device}
                onChange={(e) => setConfig({ ...config, device: e.target.value })}
                className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              >
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA (GPU) ⚡</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Hardware for running the quantization process.
              </p>
            </div>

            {/* Output Name Postfix */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output Name Postfix
              </label>
              <input
                type="text"
                value={config.output_name_postfix}
                onChange={(e) =>
                  setConfig({ ...config, output_name_postfix: e.target.value })
                }
                className="block w-full rounded-md border border-gray-300 pl-3 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                <code className="bg-gray-100 px-1 rounded font-mono text-xs">
                  {selectedModel?.name}{config.output_name_postfix}
                </code>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start gap-3">
        <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p>
          Quantization reduces the numerical precision of model weights and/or activations.
          The quantized model is saved as a new{" "}
          <span className="font-medium">full_model</span> alongside the
          original — your original model remains unchanged.
        </p>
      </div>
    </div>
  );

  const renderStep5 = () => {
    const selectedType = QUANTIZATION_TYPES.find((t) => t.value === config.quantization_type);
    return (
      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-6">
          Quantization Summary
        </h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <div className="bg-white p-4 rounded-lg border border-gray-100">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Model
            </dt>
            <dd className="text-sm font-medium text-gray-900">
              {selectedModel?.name}
              <span className="ml-2 text-xs text-gray-500">
                ({selectedModel?.format})
              </span>
            </dd>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-100">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Dataset
            </dt>
            <dd className="text-sm font-medium text-gray-900">
              {selectedDataset?.name || "None (Random Input)"}
            </dd>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-100">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Preprocessing
            </dt>
            <dd className="text-sm font-medium text-gray-900">
              {selectedPreprocessing?.name ||
                (selectedDataset
                  ? "Default (Resize 224×224)"
                  : "N/A")}
            </dd>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-100">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Output Model Name
            </dt>
            <dd className="text-sm font-medium text-primary-600 font-mono">
              {selectedModel?.name}
              {config.output_name_postfix}
            </dd>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-100 sm:col-span-2">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Quantization Config
            </dt>
            <dd>
              <ul className="grid grid-cols-2 gap-2 text-sm text-gray-900">
                <li>
                  <span className="text-gray-500">Type: </span>
                  {selectedType?.label || config.quantization_type}
                </li>
                {!isFpMode && (
                  <li>
                    <span className="text-gray-500">Bit Width: </span>
                    {config.bit_width.toUpperCase()}
                  </li>
                )}
                {isStaticMode && (
                  <li>
                    <span className="text-gray-500">Backend: </span>
                    {config.backend.toUpperCase()}
                  </li>
                )}
                {config.quantization_type === "dynamic" && (
                  <li>
                    <span className="text-gray-500">Target Layers: </span>
                    {config.target_layer_types.join(", ")}
                  </li>
                )}
                {isStaticMode && (
                  <>
                    <li>
                      <span className="text-gray-500">Per-Channel: </span>
                      {config.per_channel ? "Yes" : "No"}
                    </li>
                    <li>
                      <span className="text-gray-500">Calibration Samples: </span>
                      {config.calibration_num_samples}
                    </li>
                  </>
                )}
                <li>
                  <span className="text-gray-500">Device: </span>
                  {config.device.toUpperCase()}
                </li>
              </ul>
            </dd>
          </div>
        </dl>
      </div>
    );
  };

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
            New Quantization
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
                  <FiLoader className="mr-2 inline animate-spin" /> Starting…
                </>
              ) : (
                <>
                  <FiMinimize2 className="mr-2 inline" /> Create Quantized Model
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
            Quantization
          </h2>
          <p className="text-sm text-gray-500">
            Reduce weight precision to compress and accelerate your PyTorch models
          </p>
        </div>
        {!isReadonly && (
          <Button
            onClick={handleStartWizard}
            disabled={quantizations.some(
              (q) => q.status === "running" || q.status === "pending",
            )}
            title={
              quantizations.some(
                (q) => q.status === "running" || q.status === "pending",
              )
                ? "A quantization is already in progress"
                : undefined
            }
            className="flex items-center"
          >
            <FiMinimize2 className="mr-2" /> Create Quantized Model
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!loading && quantizations.length === 0 && (
        <div className="text-center py-14 bg-white rounded-lg border border-gray-200 border-dashed">
          <FiMinimize2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            No quantizations yet
          </h3>
          <p className="text-gray-500 mb-6">
            Start quantizing a model to reduce its size and inference time.
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
                        Type
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created Model
                    </th>
                    {!selectedQuantization && (
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
                  {quantizations.map((quant) => {
                    const qId = quant.id || quant._id;
                    const isRunning = quant.status === "pending" || quant.status === "running";
                    const prog = quantProgress[qId];
                    return (
                    <React.Fragment key={qId}>
                    <tr
                      onClick={() => setSelectedQuantization(quant)}
                      className={`cursor-pointer transition-colors ${
                        (selectedQuantization?.id || selectedQuantization?._id) === qId
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={quant.status} />
                      </td>
                      {!selectedQuantization && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                            {quant.config?.quantization_type || "-"}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-700 truncate max-w-[300px]" title={quant.result?.output_model_name || "-"}>
                        {quant.result?.output_model_name || (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {!selectedQuantization && (
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                          {quant.status === "completed" && (
                            <button
                              onClick={(e) => handleDownloadReport(qId, e)}
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
                          {isRunning && (
                            <button
                              onClick={(e) => handleCancelQuantization(qId, e)}
                              title="Cancel Quantization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiStopCircle size={16} />
                            </button>
                          )}
                          {(quant.status === "completed" ||
                            quant.status === "failed" ||
                            quant.status === "cancelled") && (
                            <button
                              onClick={(e) => handleDeleteQuantization(qId, e)}
                              title="Delete Quantization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQuantization(quant);
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
                        className={`cursor-pointer ${(selectedQuantization?.id || selectedQuantization?._id) === qId ? "bg-blue-50" : ""}`}
                        onClick={() => setSelectedQuantization(quant)}
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
                      <FiMinimize2 className="text-gray-500" />
                      Quantization Details
                      <StatusBadge status={selectedQuantization.status} />
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 ml-6 font-mono">
                      ID: {selectedQuantization.id || selectedQuantization._id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(selectedQuantization.status === "running" ||
                      selectedQuantization.status === "pending") && (
                      <button
                        onClick={(e) =>
                          handleCancelQuantization(selectedQuantization.id || selectedQuantization._id, e)
                        }
                        title="Cancel Quantization"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiStopCircle size={18} />
                      </button>
                    )}
                    {selectedQuantization.status === "completed" && (
                      <button
                        onClick={(e) =>
                          handleDownloadReport(selectedQuantization.id || selectedQuantization._id, e)
                        }
                        title="Download PDF Report"
                        className="text-gray-400 hover:text-primary-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiFileText size={18} />
                      </button>
                    )}
                    {(selectedQuantization.status === "completed" ||
                      selectedQuantization.status === "failed" ||
                      selectedQuantization.status === "cancelled") && (
                      <button
                        onClick={(e) =>
                          handleDeleteQuantization(selectedQuantization.id || selectedQuantization._id, e)
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
                                    ? value.join(", ")
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
                    Object.keys(selectedQuantization.result || {}).length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <FiTrendingDown size={14} /> Quantization Results
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

                        {/* Recommended device badge */}
                        {selectedQuantization.result.recommended_device && (
                          <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
                            <FiMonitor className="text-indigo-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-indigo-700 font-medium">
                                Recommended Deployment Target
                              </p>
                              <p className="text-sm font-medium text-indigo-800">
                                {selectedQuantization.result.recommended_device}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          {/* Quantization type */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Quantization Type
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {selectedQuantization.result.quantization_type || "-"}
                            </p>
                          </div>
                          {/* Bit width */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Bit Width
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(selectedQuantization.result.bit_width || "-").toUpperCase()}
                            </p>
                          </div>
                          {/* File size */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              File Size (quantized)
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(
                                (selectedQuantization.result.quantized_size_bytes || 0) /
                                (1024 * 1024)
                              ).toFixed(2)}{" "}
                              MB
                            </p>
                            <p className="text-xs text-gray-400">
                              was{" "}
                              {(
                                (selectedQuantization.result.original_size_bytes || 0) /
                                (1024 * 1024)
                              ).toFixed(2)}{" "}
                              MB
                            </p>
                          </div>
                          {/* Size reduction */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Size Reduction
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {selectedQuantization.result.size_reduction_pct}%
                            </p>
                          </div>
                          {/* Inference time */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Inference Time
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {selectedQuantization.result.after_inference_ms?.toFixed(2) || "-"} ms
                            </p>
                            <p className="text-xs text-gray-400">
                              was {selectedQuantization.result.before_inference_ms?.toFixed(2) || "-"} ms
                            </p>
                          </div>
                          {/* Speedup */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Speedup Factor
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {selectedQuantization.result.speedup_factor || "-"}x
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Running indicator */}
                  {(selectedQuantization.status === "pending" ||
                    selectedQuantization.status === "running") && (
                    <div className="py-6 space-y-4">
                      <div className="flex items-center gap-3 text-gray-700">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 flex-shrink-0" />
                        <span className="text-sm font-medium">
                          {quantProgress[selectedQuantization.id || selectedQuantization._id]?.message || "Quantization in progress…"}
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
