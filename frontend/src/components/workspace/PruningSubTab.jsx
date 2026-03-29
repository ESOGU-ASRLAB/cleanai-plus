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
  FiStar,
} from "react-icons/fi";

const OPTIMIZATION_STEPS = [
  { id: 1, title: "Select Model" },
  { id: 2, title: "Select Dataset" },
  { id: 3, title: "Preprocessing" },
  { id: 4, title: "Pruning Config" },
  { id: 5, title: "Review & Create" },
];

const IMPORTANCE_OPTIONS = [
  {
    value: "magnitude_l1",
    label: "Magnitude L1",
    description: "Prunes filters with the smallest L1 weight norm. Recommended for most models.",
  },
  {
    value: "magnitude_l2",
    label: "Magnitude L2",
    description: "Prunes filters with the smallest L2 weight norm.",
  },
  {
    value: "group_magnitude_l1",
    label: "Group Magnitude L1",
    description: "L1 norm evaluated across the entire pruning group (coupled layers). More accurate than per-layer magnitude.",
  },
  {
    value: "group_magnitude_l2",
    label: "Group Magnitude L2",
    description: "L2 norm evaluated across the entire pruning group (coupled layers). More accurate than per-layer magnitude.",
  },
  {
    value: "lamp",
    label: "LAMP",
    description: "Layer-Adaptive Magnitude-based Pruning. Balances pruning ratio across layers.",
  },
  {
    value: "activation",
    label: "Activation (calibration pass)",
    description: "Scores channels by the magnitude of their input activations via forward hooks. Performs a calibration forward pass automatically. More representative of actual runtime behavior.",
  },
  {
    value: "taylor",
    label: "Taylor (gradient pass) ✨",
    description: "Uses first-order Taylor expansion of loss. Performs a calibration backward pass automatically.",
  },
  {
    value: "neuron_coverage",
    label: "Neuron Coverage (data-driven) ✨",
    description: "Data-driven pruning based on neuron activation coverage on test data. Identifies and removes underutilized 'dead' neurons. Requires calibration pass.",
  },
  {
    value: "wanda",
    label: "WANDA (Weight AND Activation) ✨",
    description: "Combines weight magnitude with activation magnitude (Weight × Activation). Training-free, more balanced than magnitude-only or activation-only methods. Requires calibration pass.",
  },
  {
    value: "fpgm",
    label: "FPGM",
    description: "Filter Pruning via Geometric Median. Removes filters closest to the geometric median of their layer.",
  },
  {
    value: "bn_scale",
    label: "BatchNorm Scale",
    description: "Prunes channels by BatchNorm \u03b3 (gamma) scale factors. Requires BatchNorm layers in the model.",
  },
  {
    value: "random",
    label: "Random",
    description: "Randomly selects filters to prune. Useful as a baseline comparison.",
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

const PruningSubTab = ({ workspace, isReadonly = false }) => {
  const { token } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const [view, setView] = useState("list"); // "list" | "create"
  const [optimizations, setOptimizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedOptimization, setSelectedOptimization] = useState(null);
  const [creating, setCreating] = useState(false);

  // Wizard state
  const [activeStep, setActiveStep] = useState(1);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null); // null = no dataset
  const [selectedPreprocessing, setSelectedPreprocessing] = useState(null);
  const [config, setConfig] = useState({
    pruning_ratio: 0.5,
    importance_type: "magnitude_l1",
    iterative_steps: 1,
    device: "cuda",
    output_name_postfix: "_magnitude_l1_pruned",
    custom_output_name: "",
    global_pruning: false,
    max_pruning_ratio: 1.0,
    round_to: "",
    isomorphic: false,
    bn_scale_reg: 0.00001,
    bn_scale_group_lasso: false,
    calibration_num_samples: 16,
    coverage_metric: "frequency",
    wanda_weight_norm: "l2",
    ignore_head: true,
    ignored_layer_names: [],
  });

  // Custom output name toggle (UI-only, not part of config)
  const [useCustomName, setUseCustomName] = useState(false);

  // Layer list for ignored_layers dropdown
  const [modelLayers, setModelLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState(false);
  const [ignoredLayersOpen, setIgnoredLayersOpen] = useState(false);

  // Live progress map for running/pending optimizations: { [id]: { progress, message } }
  const [optProgress, setOptProgress] = useState({});

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

  const fetchOptimizations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/optimizations`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setOptimizations(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, token]);

  useEffect(() => {
    if (workspaceId) {
      fetchOptimizations();
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

  // Auto-refresh running optimizations
  useEffect(() => {
    const hasRunning = optimizations.some(
      (o) => o.status === "pending" || o.status === "running",
    );
    if (!hasRunning) return;
    const interval = setInterval(fetchOptimizations, 4000);
    return () => clearInterval(interval);
  }, [optimizations, fetchOptimizations]);

  // Poll /progress for all running/pending optimizations
  useEffect(() => {
    const running = optimizations.filter(
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
              `http://localhost:8000/api/workspaces/${workspaceId}/optimizations/${optId}/progress`,
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
      setOptProgress((prev) => ({ ...prev, ...updates }));
    };

    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [optimizations, workspaceId, token]);

  // Fetch layer list when model is selected
  useEffect(() => {
    if (!selectedModel) {
      setModelLayers([]);
      return;
    }
    const modelId = selectedModel.id || selectedModel._id;
    setLayersLoading(true);
    fetch(
      `http://localhost:8000/api/workspaces/${workspaceId}/optimizations/model-layers/${modelId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => r.json())
      .then((data) => {
        const layers = data.layers || [];
        setModelLayers(layers);
        // Pre-select the last Linear layer (classifier head) by default
        const linearLayers = layers.filter((l) => l.type === "Linear");
        const lastLinear = linearLayers[linearLayers.length - 1];
        if (lastLinear) {
          setConfig((prev) => ({ ...prev, ignored_layer_names: [lastLinear.name] }));
        }
      })
      .catch(() => setModelLayers([]))
      .finally(() => setLayersLoading(false));
    // Reset previously selected ignored layers when model changes
    setConfig((prev) => ({ ...prev, ignored_layer_names: [] }));
    setIgnoredLayersOpen(false);
  }, [selectedModel, workspaceId, token]);

  const handleStartWizard = () => {
    setView("create");
    setActiveStep(1);
    setSelectedModel(null);
    setSelectedDataset(null);
    setSelectedPreprocessing(null);
    setConfig({
      pruning_ratio: 0.5,
      importance_type: "magnitude_l1",
      iterative_steps: 1,
      device: "cuda",
      output_name_postfix: "_magnitude_l1_pruned",
      custom_output_name: "",
      global_pruning: false,
      max_pruning_ratio: 1.0,
      round_to: "",
      isomorphic: false,
      bn_scale_reg: 0.00001,
      bn_scale_group_lasso: false,
      calibration_num_samples: 16,
      coverage_metric: "frequency",
      wanda_weight_norm: "l2",
      ignore_head: true,
      ignored_layer_names: [],
    });
    setUseCustomName(false);
    setModelLayers([]);
  };

  const handleCreateOptimization = async () => {
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
        `http://localhost:8000/api/workspaces/${workspaceId}/optimizations`,
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
        setOptimizations((prev) => [newOpt, ...prev]);
        setView("list");
      } else {
        const err = await res.json();
        showAlert(
          err.detail || "Failed to start optimization",
          "Error",
          "error",
        );
      }
    } catch (err) {
      console.error(err);
      showAlert("Failed to start optimization", "Error", "error");
    } finally {
      setCreating(false);
    }
  };

  const canProceed = () => {
    if (activeStep === 1) return !!selectedModel;
    if (activeStep === 2) return !!selectedDataset;
    return true;
  };

  const handleCancelOptimization = async (optimizationId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "Are you sure you want to cancel this optimization? This action cannot be undone.",
      "Cancel Optimization",
      "warning",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/optimizations/${optimizationId}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        fetchOptimizations();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert(data.detail || "Could not cancel optimization.", "Cancel Failed", "error");
      }
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const handleDeleteOptimization = async (optimizationId, e) => {
    if (e) e.stopPropagation();
    const confirmed = await showConfirm(
      "This optimization and all its data will be permanently deleted. This action cannot be undone.",
      "Delete Optimization",
      "danger",
    );
    if (!confirmed) return;
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/optimizations/${optimizationId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok || res.status === 204) {
        setOptimizations((prev) => prev.filter((o) => (o.id || o._id) !== optimizationId));
        if ((selectedOptimization?.id || selectedOptimization?._id) === optimizationId)
          setSelectedOptimization(null);
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert(data.detail || "Could not delete optimization.", "Delete Failed", "error");
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleDownloadOptReport = async (optimizationId, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/optimizations/${optimizationId}/report`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `optimization_report_${optimizationId}.pdf`;
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
                        Not supported for pruning
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
      {selectedDataset ? (
        <>
          <p className="text-sm text-gray-600 mb-4">
            Select preprocessing to apply to dataset samples used as example
            inputs.
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
              Pruning Configuration
            </h3>
            <p className="text-sm text-gray-500">
              Configure torch-pruning parameters.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pruning Ratio */}
          {/* min=1, max=99 → center = (1+99)/2 = 50, so 50% is exactly at mid-track AND 1–9% is reachable */}
          <div className="col-span-1 md:col-span-2">
            {(() => {
              const pct = Math.round(config.pruning_ratio * 100);
              const { labelColor, trackColor, badgeBg, badgeText, zone } =
                pct < 10
                  ? { labelColor: "text-green-600",  trackColor: "accent-green-500",  badgeBg: "bg-green-100",  badgeText: "text-green-700",  zone: "Conservative" }
                  : pct < 20
                  ? { labelColor: "text-teal-600",   trackColor: "accent-teal-500",   badgeBg: "bg-teal-100",   badgeText: "text-teal-700",   zone: "Mild" }
                  : pct < 50
                  ? { labelColor: "text-amber-600",  trackColor: "accent-amber-500",  badgeBg: "bg-amber-100",  badgeText: "text-amber-700",  zone: "Moderate" }
                  : { labelColor: "text-red-600",    trackColor: "accent-red-500",    badgeBg: "bg-red-100",    badgeText: "text-red-700",    zone: "Aggressive" };
              return (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">
                      Pruning Ratio:{" "}
                      <span className={`font-bold ${labelColor}`}>{pct}%</span>
                    </label>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeBg} ${badgeText}`}>
                      {zone}
                    </span>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="99"
                    step="1"
                    value={Math.round(config.pruning_ratio * 100)}
                    onChange={(e) =>
                      setConfig({ ...config, pruning_ratio: parseInt(e.target.value) / 100 })
                    }
                    className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${trackColor}`}
                  />

                  {/*
                    Zone bar: gradient stops computed from slider formula (v-1)/(99-1)*100
                    Boundaries at v=9.5 → 8.67%,  v=19.5 → 18.88%,  v=49.5 → 49.49%
                    Label midpoints:  4.34%  |  13.78%  |  34.18%  |  74.75%
                  */}
                  <div className="relative w-full mt-2 select-none">
                    <div
                      className="w-full h-1.5 rounded"
                      style={{
                        background:
                          "linear-gradient(to right, #22c55e 0% 8.67%, #14b8a6 8.67% 18.88%, #f59e0b 18.88% 49.49%, #ef4444 49.49% 100%)",
                      }}
                    />
                    <div className="relative h-4 mt-0.5">
                      <span className="absolute text-xs text-green-500 font-medium whitespace-nowrap" style={{ left: "4.34%",  transform: "translateX(-50%)" }}>1–9%</span>
                      <span className="absolute text-xs text-teal-500  font-medium whitespace-nowrap" style={{ left: "13.78%", transform: "translateX(-50%)" }}>10–19%</span>
                      <span className="absolute text-xs text-amber-500 font-medium whitespace-nowrap" style={{ left: "34.18%", transform: "translateX(-50%)" }}>20–49%</span>
                      <span className="absolute text-xs text-red-500   font-medium whitespace-nowrap" style={{ left: "74.75%", transform: "translateX(-50%)" }}>50–99%</span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Fraction of channels to remove. Higher values = smaller model but possible accuracy loss.
                  </p>
                </>
              );
            })()}
          </div>

          {/* Importance Type + Criterion-Specific Parameters (side-by-side) */}
          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Importance Criterion */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Importance Criterion
              </label>
              <select
                value={config.importance_type}
                className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                onChange={(e) => {
                  const newType = e.target.value;
                  const currentPostfix = config.output_name_postfix;
                  // Auto-update postfix only if it still matches the previous auto-generated pattern
                  const prevAuto = `_${config.importance_type}_pruned`;
                  const newPostfix =
                    currentPostfix === prevAuto ? `_${newType}_pruned` : currentPostfix;
                  setConfig({ ...config, importance_type: newType, output_name_postfix: newPostfix });
                }}
              >
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {/* Show description for selected criterion */}
              {(() => {
                const selected = IMPORTANCE_OPTIONS.find(
                  (o) => o.value === config.importance_type
                );
                return selected ? (
                  <p className="mt-1 text-xs text-gray-500">{selected.description}</p>
                ) : null;
              })()}
            </div>

            {/* Right: Criterion-Specific Configuration */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-2">
                <FiSliders className="w-3.5 h-3.5" />
                <span>Criterion Configuration</span>
              </div>
              
              {/* BN Scale params */}
              {config.importance_type === "bn_scale" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      BN Regularization
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={config.bn_scale_reg}
                      onChange={(e) =>
                        setConfig({ ...config, bn_scale_reg: parseFloat(e.target.value) || 1e-5 })
                      }
                      className="block w-full rounded-md border border-gray-300 pl-2 py-1.5 text-sm font-mono focus:border-primary-500 focus:ring-primary-500"
                    />
                    <p className="mt-0.5 text-xs text-gray-500">L1 reg coefficient for BatchNorm ╬│</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Group Lasso</label>
                      <p className="text-xs text-gray-500">Group Lasso vs L1</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConfig({ ...config, bn_scale_group_lasso: !config.bn_scale_group_lasso })
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        config.bn_scale_group_lasso ? "bg-primary-600" : "bg-gray-300"
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        config.bn_scale_group_lasso ? "translate-x-4" : "translate-x-0"
                      }`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Neuron Coverage params */}
              {config.importance_type === "neuron_coverage" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Coverage Metric
                  </label>
                  <select
                    value={config.coverage_metric}
                    onChange={(e) =>
                      setConfig({ ...config, coverage_metric: e.target.value })
                    }
                    className="block w-full rounded-md border border-gray-300 pl-2 pr-8 py-1.5 text-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="normalized_mean">Normalized Mean</option>
                    <option value="frequency">Activation Frequency ✨</option>
                    <option value="mean_absolute">Mean Absolute</option>
                    <option value="combined">Combined (60/40)</option>
                  </select>
                  <p className="mt-0.5 text-xs text-gray-500">
                    How to measure neuron usage on calibration data
                  </p>
                </div>
              )}

              {/* WANDA params */}
              {config.importance_type === "wanda" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Weight Norm
                  </label>
                  <select
                    value={config.wanda_weight_norm}
                    onChange={(e) =>
                      setConfig({ ...config, wanda_weight_norm: e.target.value })
                    }
                    className="block w-full rounded-md border border-gray-300 pl-2 pr-8 py-1.5 text-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="l1">L1 Norm</option>
                    <option value="l2">L2 Norm ✨</option>
                  </select>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Weight magnitude metric for WANDA formula
                  </p>
                  <div className="mt-2 p-2 rounded text-xs text-gray-600 border border-gray-200">
                    <strong>Formula:</strong> Importance = |Weight| × |Activation|
                  </div>
                </div>
              )}

              {/* Taylor params info */}
              {config.importance_type === "taylor" && (
                <div className="text-xs text-gray-600 italic">
                  <FiCheckCircle className="w-4 h-4 inline text-green-600 mr-1" />
                  Gradient-based importance (automatic calibration)
                </div>
              )}

              {/* Activation params info */}
              {config.importance_type === "activation" && (
                <div className="text-xs text-gray-600 italic">
                  <FiCheckCircle className="w-4 h-4 inline text-green-600 mr-1" />
                  Activation-based importance (automatic forward pass)
                </div>
              )}

              {/* No params needed */}
              {!["bn_scale", "neuron_coverage", "wanda", "taylor", "activation"].includes(config.importance_type) && (
                <div className="text-xs text-gray-400 italic flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4" />
                  <span>No additional configuration required</span>
                </div>
              )}
            </div>
          </div>

          {/* Core Configuration Section */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
              <FiSettings className="w-4 h-4 text-gray-500" />
              <span>Core Configuration</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Iterative Steps */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Iterative Steps
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={config.iterative_steps}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      iterative_steps: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  className="block w-full rounded-md border border-gray-300 pl-3 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Number of pruning iterations (1 = one-shot).
                </p>
              </div>

              {/* Device */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compute Device
                </label>
                <select
                  value={config.device}
                  onChange={(e) =>
                    setConfig({ ...config, device: e.target.value })
                  }
                  className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  <option value="cpu">CPU</option>
                  <option value="cuda">CUDA (GPU) ⚡</option>
                  <option value="mps">MPS (Mac)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Hardware accelerator for pruning operations.
                </p>
              </div>

              {/* Max Pruning Ratio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Pruning Ratio per Layer:{" "}
                  <span className="text-primary-600 font-bold">
                    {Math.round(config.max_pruning_ratio * 100)}%
                  </span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={config.max_pruning_ratio}
                  onChange={(e) =>
                    setConfig({ ...config, max_pruning_ratio: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>10%</span>
                  <span>100% (no cap)</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Upper bound on how much any single layer can be pruned.
                </p>
              </div>

              {/* Round To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Round Channels To
                </label>
                <select
                  value={config.round_to}
                  onChange={(e) => setConfig({ ...config, round_to: e.target.value })}
                  className="block w-full rounded-md border border-gray-300 pl-3 pr-8 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  <option value="">None (exact)</option>
                  <option value="8">8 (tensor core friendly)</option>
                  <option value="16">16 (tensor core optimal)</option>
                  <option value="32">32</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Rounds pruned channel count to nearest multiple (recommended: 8 or 16).
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Options Section */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
              <FiZap className="w-4 h-4 text-gray-500" />
              <span>Advanced Options</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Global Pruning */}
              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Global Pruning
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Distribute pruning budget globally across all layers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, global_pruning: !config.global_pruning })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.global_pruning ? "bg-primary-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.global_pruning ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Isomorphic */}
              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Isomorphic
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Apply uniform pruning ratio to every layer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, isomorphic: !config.isomorphic })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.isomorphic ? "bg-primary-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.isomorphic ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Calibration & Output Section */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
              <FiTarget className="w-4 h-4 text-gray-500" />
              <span>Calibration & Output</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Calibration Samples */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calibration Samples
                </label>
                <div className="flex rounded-md shadow-sm">
                  <input
                    type="number"
                    min="1"
                    max="256"
                    value={config.calibration_num_samples}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        calibration_num_samples: Math.max(1, parseInt(e.target.value) || 1),
                      })
                    }
                    className="flex-1 block w-full rounded-none rounded-l-md border-gray-300 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2 pl-3 border"
                  />
                  <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                    / {selectedDataset?.file_count ?? "-"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Dataset samples for benchmarking and importance scoring.
                </p>
              </div>

              {/* Output Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {useCustomName ? "Output Model Name" : "Output Name Postfix"}
                </label>
                {useCustomName ? (
                  <input
                    type="text"
                    value={config.custom_output_name}
                    onChange={(e) =>
                      setConfig({ ...config, custom_output_name: e.target.value })
                    }
                    placeholder="my_pruned_model"
                    className="block w-full rounded-md border border-gray-300 pl-3 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  />
                ) : (
                  <input
                    type="text"
                    value={config.output_name_postfix}
                    onChange={(e) =>
                      setConfig({ ...config, output_name_postfix: e.target.value })
                    }
                    placeholder={`_${config.importance_type}_pruned`}
                    className="block w-full rounded-md border border-gray-300 pl-3 py-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  />
                )}
                {/* Toggle between postfix and full custom name */}
                <button
                  type="button"
                  onClick={() => setUseCustomName((v) => !v)}
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 transition-colors"
                >
                  <span className={`inline-flex w-7 h-4 rounded-full transition-colors ${
                    useCustomName ? "bg-primary-500" : "bg-gray-300"
                  }`}>
                    <span className={`inline-block w-3 h-3 m-0.5 rounded-full bg-white shadow transition-transform ${
                      useCustomName ? "translate-x-3" : "translate-x-0"
                    }`} />
                  </span>
                  {useCustomName ? "Using custom name" : "Use custom name instead"}
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  <code className="bg-gray-100 px-1 rounded font-mono text-xs">
                    {useCustomName
                      ? (config.custom_output_name || <span className="text-gray-400">my_pruned_model</span>)
                      : <>{selectedModel?.name}{config.output_name_postfix}</>}
                  </code>
                </p>
              </div>
            </div>
          </div>

          {/* Layer Exclusions Section */}
          <div className="col-span-1 md:col-span-2">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2 border-b border-gray-200 pb-2">
              <FiEyeOff className="w-4 h-4 text-gray-500" />
              <span>Layer Exclusions</span>
            </h4>

            {/* Ignore Head */}
            <div className="flex items-start justify-between gap-4 py-1 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Ignore Classifier Head
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Automatically exclude the last Linear layer (output head) from pruning.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newVal = !config.ignore_head;
                  const headLayers = modelLayers.filter((l) => l.type === "Linear");
                  const headName = headLayers[headLayers.length - 1]?.name;
                  let newIgnored = config.ignored_layer_names;
                  if (headName) {
                    newIgnored = newVal
                      ? [...new Set([...config.ignored_layer_names, headName])]
                      : config.ignored_layer_names.filter((n) => n !== headName);
                  }
                  setConfig({ ...config, ignore_head: newVal, ignored_layer_names: newIgnored });
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  config.ignore_head ? "bg-primary-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    config.ignore_head ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Ignored Layers multi-select - collapsible */}
            <div>
              <button
                type="button"
                onClick={() => setIgnoredLayersOpen((o) => !o)}
                className="w-full flex items-center justify-between text-sm font-medium text-gray-700 py-2 border-b border-gray-200 hover:text-primary-600 transition-colors"
              >
                <span>
                  Additional Ignored Layers
                  {config.ignored_layer_names.length > 0 && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                      {config.ignored_layer_names.length} selected
                    </span>
                  )}
                  {layersLoading && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">LoadingÔÇĞ</span>
                  )}
                </span>
                {ignoredLayersOpen ? (
                  <FiChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <FiChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {ignoredLayersOpen && (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                  <strong>Note:</strong> The last Linear layer (classifier head) is pre-selected below and also
                  protected by the <em>Ignore Classifier Head</em> toggle above - pruning it would change the
                  model&apos;s output shape. You can deselect it here to override this default, but make sure the
                  toggle above is also turned off.
                </p>
                {modelLayers.length === 0 && !layersLoading ? (
                  <p className="text-xs text-gray-400 italic">
                    {selectedModel
                      ? "No prunable layers found or model could not be loaded for inspection."
                      : "Select a model first to see available layers."}
                  </p>
                ) : (
                  <>
                    <div className="border border-gray-300 rounded-md max-h-60 overflow-y-auto divide-y divide-gray-100">
                      {modelLayers.map((layer) => {
                        const selected = config.ignored_layer_names.includes(layer.name);
                        const isAutoHead =
                          layer.type === "Linear" &&
                          modelLayers.filter((l) => l.type === "Linear").slice(-1)[0]?.name === layer.name;
                        return (
                          <label
                            key={layer.name}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                              selected ? "bg-primary-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const next = selected
                                  ? config.ignored_layer_names.filter((n) => n !== layer.name)
                                  : [...config.ignored_layer_names, layer.name];
                                // Sync ignore_head toggle if this is the head layer
                                const headLayers = modelLayers.filter((l) => l.type === "Linear");
                                const headName = headLayers[headLayers.length - 1]?.name;
                                const newIgnoreHead =
                                  layer.name === headName
                                    ? !selected
                                    : config.ignore_head;
                                setConfig({ ...config, ignored_layer_names: next, ignore_head: newIgnoreHead });
                              }}
                              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-xs font-mono text-gray-800 flex-1 min-w-0 truncate">
                              {layer.name}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">{layer.type}</span>
                            <span className="text-xs text-gray-300 shrink-0 font-mono">
                              {layer.shape.join("\u00d7")}
                            </span>
                            {isAutoHead && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                                head
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    {config.ignored_layer_names.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {config.ignored_layer_names.length} layer
                        {config.ignored_layer_names.length > 1 ? "s" : ""} will be excluded from pruning.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start gap-3">
        <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p>
          Structural pruning permanently removes channels from the model
          architecture. The pruned model is saved as a new{" "}
          <span className="font-medium">full_model</span> alongside the
          original - your original model remains unchanged.
        </p>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
      <h3 className="text-lg font-medium text-gray-900 mb-6">
        Optimization Summary
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
            {config.custom_output_name
              ? config.custom_output_name
              : <>{selectedModel?.name}{config.output_name_postfix}</>}
          </dd>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100 sm:col-span-2">
          <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Pruning Config
          </dt>
          <dd>
            <ul className="grid grid-cols-2 gap-2 text-sm text-gray-900">
              <li>
                <span className="text-gray-500">Pruning Ratio: </span>
                {Math.round(config.pruning_ratio * 100)}%
              </li>
              <li>
                <span className="text-gray-500">Importance: </span>
                {config.importance_type}
              </li>
              <li>
                <span className="text-gray-500">Iterative Steps: </span>
                {config.iterative_steps}
              </li>
              <li>
                <span className="text-gray-500">Device: </span>
                {config.device.toUpperCase()}
              </li>
              <li>
                <span className="text-gray-500">Global Pruning: </span>
                {config.global_pruning ? "Yes" : "No"}
              </li>
              <li>
                <span className="text-gray-500">Max Pruning Ratio: </span>
                {Math.round(config.max_pruning_ratio * 100)}%
              </li>
              <li>
                <span className="text-gray-500">Round Channels To: </span>
                {config.round_to || "None"}
              </li>
              <li>
                <span className="text-gray-500">Isomorphic: </span>
                {config.isomorphic ? "Yes" : "No"}
              </li>
              {config.importance_type === "bn_scale" && (
                <>
                  <li>
                    <span className="text-gray-500">BN Reg: </span>
                    {config.bn_scale_reg}
                  </li>
                  <li>
                    <span className="text-gray-500">Group Lasso: </span>
                    {config.bn_scale_group_lasso ? "Yes" : "No"}
                  </li>
                </>
              )}
              {config.importance_type === "taylor" && (
                <li>
                  <span className="text-gray-500">Calibration Samples: </span>
                  {config.calibration_num_samples}
                </li>
              )}
              {config.importance_type === "neuron_coverage" && (
                <>
                  <li>
                    <span className="text-gray-500">Coverage Metric: </span>
                    {config.coverage_metric}
                  </li>
                  <li>
                    <span className="text-gray-500">Calibration Samples: </span>
                    {config.calibration_num_samples}
                  </li>
                </>
              )}
              {config.importance_type === "wanda" && (
                <>
                  <li>
                    <span className="text-gray-500">Weight Norm: </span>
                    {config.wanda_weight_norm.toUpperCase()}
                  </li>
                  <li>
                    <span className="text-gray-500">Calibration Samples: </span>
                    {config.calibration_num_samples}
                  </li>
                </>
              )}
            </ul>
          </dd>
        </div>
        {(config.ignore_head || config.ignored_layer_names.length > 0) && (
          <div className="bg-white p-4 rounded-lg border border-gray-100 sm:col-span-2">
            <dt className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Ignored Layers
            </dt>
            <dd className="text-sm text-gray-900 space-y-1">
              {config.ignore_head && (
                <p className="text-xs text-gray-600">• Classifier head (last Linear layer) - auto</p>
              )}
              {config.ignored_layer_names.map((n) => (
                <p key={n} className="text-xs font-mono text-gray-700">• {n}</p>
              ))}
            </dd>
          </div>
        )}
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
            New Network Optimization
          </h2>
        </div>

        <Stepper steps={OPTIMIZATION_STEPS} currentStep={activeStep} />

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
              onClick={handleCreateOptimization}
              variant="primary"
              disabled={creating}
            >
              {creating ? (
                <>
                  <FiLoader className="mr-2 inline animate-spin" /> StartingÔÇĞ
                </>
              ) : (
                <>
                  <FiZap className="mr-2 inline" /> Create Optimized Model
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
            Network Optimization
          </h2>
          <p className="text-sm text-gray-500">
            Prune and compress your PyTorch models using torch-pruning
          </p>
        </div>
        {!isReadonly && (
          <Button
            onClick={handleStartWizard}
            disabled={optimizations.some(
              (o) => o.status === "running" || o.status === "pending",
            )}
            title={
              optimizations.some(
                (o) => o.status === "running" || o.status === "pending",
              )
                ? "An optimization is already in progress"
                : undefined
            }
            className="flex items-center"
          >
            <FiZap className="mr-2" /> Create Optimized Model
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!loading && optimizations.length === 0 && (
        <div className="text-center py-14 bg-white rounded-lg border border-gray-200 border-dashed">
          <FiTrendingDown className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            No optimizations yet
          </h3>
          <p className="text-gray-500 mb-6">
            Start pruning a model to compress it and reduce inference time.
          </p>
          <Button onClick={handleStartWizard}>Create Optimized Model</Button>
        </div>
      )}

      {loading && optimizations.length === 0 && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}

      {/* List + detail */}
      {optimizations.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6 transition-all duration-300 ease-in-out">
          {/* Table */}
          <div
            className={`transition-all duration-300 ${
              selectedOptimization ? "lg:w-1/2 xl:w-7/12" : "w-full"
            }`}
          >
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    {!selectedOptimization && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Model
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created Model
                    </th>
                    {!selectedOptimization && (
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
                  {optimizations.map((opt) => {
                    const optId = opt.id || opt._id;
                    const isRunning = opt.status === "pending" || opt.status === "running";
                    const prog = optProgress[optId];
                    return (
                    <React.Fragment key={opt.id}>
                    <tr
                      onClick={() => setSelectedOptimization(opt)}
                      className={`cursor-pointer transition-colors ${
                        selectedOptimization?.id === opt.id
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={opt.status} />
                      </td>
                      {!selectedOptimization && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {models.find(
                            (m) => (m.id || m._id) === opt.model_id,
                          )?.name || opt.model_id}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm text-gray-700 truncate max-w-[300px]" title={opt.result?.output_model_name || "-"}>
                        {opt.result?.output_model_name || (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {!selectedOptimization && (
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                          {opt.status === "completed" && (
                            <button
                              onClick={(e) => handleDownloadOptReport(opt.id, e)}
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
                          {(opt.status === "running" || opt.status === "pending") && (
                            <button
                              onClick={(e) => handleCancelOptimization(opt.id, e)}
                              title="Cancel Optimization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiStopCircle size={16} />
                            </button>
                          )}
                          {(opt.status === "completed" ||
                            opt.status === "failed" ||
                            opt.status === "cancelled") && (
                            <button
                              onClick={(e) => handleDeleteOptimization(opt.id, e)}
                              title="Delete Optimization"
                              className="text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <FiTrash2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOptimization(opt);
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
                        className={`cursor-pointer ${selectedOptimization?.id === optId ? "bg-blue-50" : ""}`}
                        onClick={() => setSelectedOptimization(opt)}
                      >
                        <td className="px-6 pb-3" />
                        <td
                          colSpan={!selectedOptimization ? 3 : 2}
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
          {selectedOptimization && (
            <div className="lg:w-1/2 xl:w-5/12 animate-fade-in">
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden sticky top-6">
                {/* Panel header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center gap-2">
                      <FiZap className="text-gray-500" />
                      Optimization Details
                      <StatusBadge status={selectedOptimization.status} />
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 ml-6 font-mono">
                      ID: {selectedOptimization.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {(selectedOptimization.status === "running" ||
                      selectedOptimization.status === "pending") && (
                      <button
                        onClick={(e) =>
                          handleCancelOptimization(selectedOptimization.id, e)
                        }
                        title="Cancel Optimization"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiStopCircle size={18} />
                      </button>
                    )}
                    {selectedOptimization.status === "completed" && (
                      <button
                        onClick={(e) =>
                          handleDownloadOptReport(selectedOptimization.id, e)
                        }
                        title="Download PDF Report"
                        className="text-gray-400 hover:text-primary-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiFileText size={18} />
                      </button>
                    )}
                    {(selectedOptimization.status === "completed" ||
                      selectedOptimization.status === "failed" ||
                      selectedOptimization.status === "cancelled") && (
                      <button
                        onClick={(e) =>
                          handleDeleteOptimization(selectedOptimization.id, e)
                        }
                        title="Delete Optimization"
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedOptimization(null)}
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
                            (m.id || m._id) === selectedOptimization.model_id,
                        )?.name || selectedOptimization.model_id}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Dataset</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedOptimization.dataset_id
                          ? datasets.find(
                              (d) =>
                                (d.id || d._id) ===
                                selectedOptimization.dataset_id,
                            )?.name || "Unknown"
                          : "None (Random)"}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Created</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(
                          selectedOptimization.created_at,
                        ).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">Completed</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedOptimization.completed_at
                          ? new Date(
                              selectedOptimization.completed_at,
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
                        {Object.entries(selectedOptimization.config || {}).map(
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
                  {selectedOptimization.status === "failed" &&
                    selectedOptimization.error_message && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h5 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                          <FiAlertCircle /> Error Details
                        </h5>
                        <p className="text-sm text-red-700 font-mono whitespace-pre-wrap break-all bg-white p-3 rounded border border-red-100">
                          {selectedOptimization.error_message}
                        </p>
                      </div>
                    )}

                  {/* Results */}
                  {selectedOptimization.status === "completed" &&
                    Object.keys(selectedOptimization.result || {}).length >
                      0 && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <FiTrendingDown size={14} /> Pruning Results
                        </h5>

                        {/* Output model name */}
                        {selectedOptimization.result.output_model_name && (
                          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                            <FiCheckCircle className="text-green-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-green-700 font-medium">
                                Optimized model saved:
                              </p>
                              <p className="text-sm font-mono text-green-800 font-bold">
                                {selectedOptimization.result.output_model_name}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          {/* Params */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Parameters
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {Number(
                                selectedOptimization.result.pruned_params || 0,
                              ).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400">
                              was{" "}
                              {Number(
                                selectedOptimization.result.original_params ||
                                  0,
                              ).toLocaleString()}
                            </p>
                          </div>
                          {/* Param reduction */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              Param Reduction
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {selectedOptimization.result.param_reduction_pct}%
                            </p>
                          </div>
                          {/* MACs */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              MACs (pruned)
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(
                                (selectedOptimization.result.pruned_macs || 0) /
                                1e9
                              ).toFixed(3)}{" "}
                              G
                            </p>
                            <p className="text-xs text-gray-400">
                              was{" "}
                              {(
                                (selectedOptimization.result.original_macs ||
                                  0) / 1e9
                              ).toFixed(3)}{" "}
                              G
                            </p>
                          </div>
                          {/* MACs reduction */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              MACs Reduction
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {selectedOptimization.result.mac_reduction_pct}%
                            </p>
                          </div>
                          {/* FLOPs */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              FLOPs (pruned)
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(
                                (selectedOptimization.result.pruned_flops || 0) /
                                1e9
                              ).toFixed(3)}{" "}
                              G
                            </p>
                            <p className="text-xs text-gray-400">
                              was{" "}
                              {(
                                (selectedOptimization.result.original_flops ||
                                  0) / 1e9
                              ).toFixed(3)}{" "}
                              G
                            </p>
                          </div>
                          {/* FLOPs reduction */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              FLOPs Reduction
                            </p>
                            <p className="text-base font-bold text-green-600">
                              {selectedOptimization.result.flop_reduction_pct}%
                            </p>
                          </div>
                          {/* File size */}
                          <div className="bg-white p-3 rounded-lg border border-gray-200">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">
                              File Size (pruned)
                            </p>
                            <p className="text-base font-bold text-gray-900">
                              {(
                                (selectedOptimization.result
                                  .pruned_size_bytes || 0) /
                                (1024 * 1024)
                              ).toFixed(2)}{" "}
                              MB
                            </p>
                            <p className="text-xs text-gray-400">
                              was{" "}
                              {(
                                (selectedOptimization.result
                                  .original_size_bytes || 0) /
                                (1024 * 1024)
                              ).toFixed(2)}{" "}
                              MB
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Running indicator */}
                  {(selectedOptimization.status === "pending" ||
                    selectedOptimization.status === "running") && (
                    <div className="py-6 space-y-4">
                      <div className="flex items-center gap-3 text-gray-700">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 flex-shrink-0" />
                        <span className="text-sm font-medium">
                          {optProgress[selectedOptimization.id || selectedOptimization._id]?.message || "Pruning in progress\u2026"}
                        </span>
                        <span className="ml-auto text-sm font-semibold text-primary-600 tabular-nums">
                          {optProgress[selectedOptimization.id || selectedOptimization._id]?.progress ?? 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-primary-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${optProgress[selectedOptimization.id || selectedOptimization._id]?.progress ?? 0}%` }}
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

export default PruningSubTab;
