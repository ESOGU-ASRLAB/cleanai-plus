import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { MainLayout } from "../components/layout";
import { Button, CodeEditor, WindowedCodeEditor } from "../components/common";
import { useTour } from "../context/TourContext";
import PreprocessingTab from "../components/workspace/PreprocessingTab";
import ExecutionTab from "../components/workspace/ExecutionTab";
import NetworkVisualizationTab from "../components/workspace/NetworkVisualizationTab";
import NetworkOptimizationTab from "../components/workspace/NetworkOptimizationTab";
import WorkspaceSettingsTab from "../components/workspace/WorkspaceSettingsTab";
import ActivityList from "../components/profile/ActivityList";
import {
  FiArrowLeft,
  FiSettings,
  FiDatabase,
  FiCpu,
  FiActivity,
  FiFolder,
  FiFile,
  FiImage,
  FiLayers,
  FiGrid,
  FiChevronDown,
  FiChevronUp,
  FiCode,
  FiX,
  FiMaximize2,
  FiTerminal,
  FiSave,
  FiShare2,
  FiEye,
  FiCloud,
  FiPlus,
  FiZap,
  FiTrash2,
  FiDownload,
  FiEyeOff,
  FiStar,
  FiUpload,
} from "react-icons/fi";

const WorkspaceDetailPage = () => {
  const { id } = useParams();
  const { token, user } = useAuth();
  const { success, error: errorToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { startTour, registerTour } = useTour();

  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // true when a logged-in user views someone else's public workspace
  // user id may be under `_id` (alias) or `id` depending on serialization
  const userId = user ? (user._id ?? user.id) : null;
  const isReadonly = workspace && userId ? workspace.owner_id !== String(userId) : false;

  const getInitialTab = () => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    if (tabParam) return tabParam;
    if (location.hash) return location.hash.replace("#", "");
    return "overview";
  };

  const getInitialExecutionId = () => {
    const params = new URLSearchParams(location.search);
    return params.get("execution");
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());
  const [initialExecutionId, setInitialExecutionId] = useState(
    getInitialExecutionId(),
  );
  const [visualizationModel, setVisualizationModel] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    const execParam = params.get("execution");

    if (tabParam) {
      setActiveTab(tabParam);
    } else if (location.hash) {
      setActiveTab(location.hash.replace("#", ""));
    }

    if (execParam) {
      setInitialExecutionId(execParam);
    }
  }, [location]);

  // Models state
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showOptimizedModels, setShowOptimizedModels] = useState(
    () => localStorage.getItem("showOptimizedModels") === "true",
  );
  const [showOnlyFavoriteModels, setShowOnlyFavoriteModels] = useState(
    () => localStorage.getItem("showOnlyFavoriteModels") === "true",
  );
  const [selectedModel, setSelectedModel] = useState(null);
  const [deleteModelId, setDeleteModelId] = useState(null);
  const [deletingModel, setDeletingModel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragUploading, setIsDragUploading] = useState(false);
  const [modelDefinitions, setModelDefinitions] = useState({});
  const [loadingDefinitions, setLoadingDefinitions] = useState({});
  const [editingModelName, setEditingModelName] = useState("");
  const [editingModelDescription, setEditingModelDescription] = useState("");
  const [savingModelMeta, setSavingModelMeta] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  // Datasets state
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [expandedSamples, setExpandedSamples] = useState({});

  // Activities state
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [loadingMoreActivities, setLoadingMoreActivities] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const ACTIVITIES_PER_PAGE = 5;

  // Stats state
  const [stats, setStats] = useState({
    models: 0,
    datasets: 0,
    executions: 0,
    co2_saved: 0,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Workspace tour for first-time visitors
  useEffect(() => {
    if (!user || !workspace) return;

    const buildSteps = () => [
      {
        target: null,
        title: "Welcome to Your Workspace!",
        content:
          "This is your workspace — an isolated environment to manage AI models, datasets, training runs, and network optimization. Let's explore each section.",
        position: "center",
      },
      {
        target: "tab-overview",
        title: "Overview",
        content:
          "The Overview tab shows workspace statistics (models, datasets, executions, CO₂ emissions) and a live activity feed of recent actions.",
        position: "bottom",
      },
      {
        target: "stats-section",
        title: "Workspace Stats",
        content:
          "Track your workspace at a glance: total models uploaded, datasets added, execution runs completed, and cumulative CO₂ emissions produced.",
        position: "bottom",
        onActivate: () => setActiveTab("overview"),
      },
      {
        target: "tab-models",
        title: "Models",
        content:
          "Upload and manage your PyTorch (.pt/.pth), ONNX, or TorchScript models. You can drag-and-drop files directly, view model architecture code, and mark favorites.",
        position: "bottom",
      },
      {
        target: "tab-datasets",
        title: "Datasets",
        content:
          "Add training and evaluation datasets. Supports image classification, object detection, and tabular data. Browse sample images and class labels inline.",
        position: "bottom",
      },
      {
        target: "tab-preprocessing",
        title: "Preprocessing",
        content:
          "Define data preprocessing pipelines using a drag-and-drop visual builder (Resize, Normalize, Augment, etc.) or write raw Python torchvision transforms code.",
        position: "bottom",
      },
      {
        target: "tab-executions",
        title: "Executions",
        content:
          "Run your models against datasets using a 5-step wizard. Monitor live progress, compare results side by side, inspect per-class accuracy, and download PDF reports.",
        position: "bottom",
      },
      {
        target: "tab-optimization",
        title: "Network Optimization",
        content:
          "Reduce model size and boost inference speed with Pruning (Taylor, WANDA, LAMP and more). Monitor optimization progress in real time.",
        position: "bottom",
      },
      {
        target: "tab-visualization",
        title: "Network Visualization",
        content:
          "Visualize your model's layer architecture in an interactive 2D graph or a full 3D view. Inspect layer types, shapes, parameter counts, and connections.",
        position: "bottom",
      },
      {
        target: "tab-settings",
        title: "Settings",
        content:
          "Update the workspace name and description, toggle its visibility between Private and Public, or permanently delete it from the Danger Zone.",
        position: "bottom",
      },
    ];

    // Register so navbar button can trigger any time
    registerTour("workspace", buildSteps);

    const userId = user._id ?? user.id;
    const tourKey = `tour_workspace_done_${userId}`;
    if (!localStorage.getItem(tourKey)) {
      localStorage.setItem(tourKey, "1");
      const t = setTimeout(() => startTour(buildSteps()), 700);
      return () => clearTimeout(t);
    }
  }, [user, workspace, startTour, registerTour]);

  const toggleSamples = (datasetId) => {
    setExpandedSamples((prev) => ({
      ...prev,
      [datasetId]: !prev[datasetId],
    }));
  };

  const handleVisualizeModel = (e, model) => {
    e.stopPropagation();
    setVisualizationModel(model);
    setActiveTab("visualization");
  };

  const handleModelSelect = async (model) => {
    // If already selected, do nothing
    if (selectedModel?._id === model._id) {
      return;
    }

    setSelectedModel(model);
    setEditingModelName(model.name || "");
    setEditingModelDescription(model.description || "");

    // If definition not loaded and file exists, fetch it
    if (model.definition_file_path && !modelDefinitions[model._id]) {
      setLoadingDefinitions((prev) => ({ ...prev, [model._id]: true }));
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}/models/${model._id}/definition`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (response.ok) {
          const data = await response.json();
          setModelDefinitions((prev) => ({ ...prev, [model._id]: data.code }));
        }
      } catch (err) {
        console.error("Failed to fetch model definition", err);
      } finally {
        setLoadingDefinitions((prev) => ({ ...prev, [model._id]: false }));
      }
    }
  };

  const handleModelDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isReadonly) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const allowedExts = [".pt", ".pth", ".pkl"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExts.includes(ext)) {
      errorToast(`Unsupported file type "${ext}". For full_model format, allowed extensions are: .pt, .pth, .pkl`);
      return;
    }
    const modelName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
    const formData = new FormData();
    formData.append("name", modelName);
    formData.append("format", "full_model");
    formData.append("file", file);
    setIsDragUploading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${id}/models/`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData },
      );
      if (res.ok) {
        const newModel = await res.json();
        setModels((prev) => [newModel, ...prev]);
        success(`"${modelName}" uploaded successfully`);
      } else {
        const data = await res.json().catch(() => ({}));
        errorToast(data.detail || "Upload failed");
      }
    } catch (err) {
      console.error("Model upload error:", err);
      errorToast("Upload failed");
    } finally {
      setIsDragUploading(false);
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteModelId) return;
    setDeletingModel(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}/models/${deleteModelId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error("Failed to delete model");
      if (selectedModel?._id === deleteModelId) setSelectedModel(null);
      setModels((prev) => prev.filter((m) => m._id !== deleteModelId));
      success("Model deleted successfully");
    } catch (err) {
      errorToast(err.message || "Failed to delete model");
    } finally {
      setDeletingModel(false);
      setDeleteModelId(null);
    }
  };

  const handleModelToggle = (e, model) => {
    e.stopPropagation();
    if (selectedModel?._id === model._id) {
      setSelectedModel(null);
    } else {
      handleModelSelect(model);
    }
  };

  const handleDefinitionChange = (value) => {
    if (selectedModel) {
      setModelDefinitions((prev) => ({
        ...prev,
        [selectedModel._id]: value,
      }));
    }
  };

  const handleSaveModelMeta = async () => {
    if (!selectedModel) return;
    setSavingModelMeta(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}/models/${selectedModel._id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: editingModelName.trim() || selectedModel.name,
            description: editingModelDescription,
          }),
        },
      );
      if (response.ok) {
        const updated = await response.json();
        setModels((prev) =>
          prev.map((m) => (m._id === selectedModel._id ? updated : m)),
        );
        setSelectedModel(updated);
        success("Model updated successfully");
      } else {
        errorToast("Failed to update model");
      }
    } catch (err) {
      errorToast("Failed to update model");
      console.error(err);
    } finally {
      setSavingModelMeta(false);
    }
  };

  const handleSaveDefinition = async () => {
    if (!selectedModel || !modelDefinitions[selectedModel._id]) return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}/models/${selectedModel._id}/definition`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            code: modelDefinitions[selectedModel._id],
          }),
        },
      );

      if (response.ok) {
        success("Model definition updated successfully");
      } else {
        throw new Error("Failed to update definition");
      }
    } catch (err) {
      errorToast(err.message || "Failed to save definition");
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Workspace not found");
          }
          if (response.status === 403) {
            throw new Error(
              "You do not have permission to view this workspace",
            );
          }
          throw new Error("Failed to fetch workspace");
        }

        const data = await response.json();
        setWorkspace(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token && id) {
      fetchWorkspace();
    }
  }, [id, token]);

  // Fetch models when switching to models tab
  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}/models/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setModels(data);
        }
      } catch (err) {
        console.error("Failed to fetch models:", err);
      } finally {
        setModelsLoading(false);
      }
    };

    if (activeTab === "models" && id && token) {
      fetchModels();
    }
  }, [activeTab, id, token]);

  // Fetch datasets when switching to datasets tab
  useEffect(() => {
    const fetchDatasets = async () => {
      setDatasetsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}/datasets/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setDatasets(data);
        }
      } catch (err) {
        console.error("Failed to fetch datasets:", err);
      } finally {
        setDatasetsLoading(false);
      }
    };

    if (activeTab === "datasets" && id && token) {
      fetchDatasets();
    }
  }, [activeTab, id, token]);

  // Fetch activities when switching to overview tab
  useEffect(() => {
    const fetchActivities = async () => {
      setActivitiesLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}/activities?limit=${ACTIVITIES_PER_PAGE}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setActivities(data);
          setHasMoreActivities(data.length === ACTIVITIES_PER_PAGE);
        }
      } catch (err) {
        console.error("Failed to fetch activities:", err);
      } finally {
        setActivitiesLoading(false);
      }
    };

    if (activeTab === "overview" && id && token) {
      fetchActivities();
    }
  }, [activeTab, id, token]);

  // Fetch stats when switching to overview tab
  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${id}/stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setStatsLoading(false);
      }
    };

    if (activeTab === "overview" && id && token) {
      fetchStats();
    }
  }, [activeTab, id, token]);

  const loadMoreActivities = async () => {
    try {
      setLoadingMoreActivities(true);
      const nextLimit = activities.length + ACTIVITIES_PER_PAGE;
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}/activities?limit=${nextLimit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setActivities(data);
        setHasMoreActivities(data.length === nextLimit);
      }
    } catch (err) {
      console.error("Failed to load more activities:", err);
    } finally {
      setLoadingMoreActivities(false);
    }
  };

  const handleUpdateWorkspace = async (updateData) => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updateData),
        },
      );

      if (!response.ok) throw new Error("Failed to update workspace");

      const updatedWorkspace = await response.json();
      setWorkspace(updatedWorkspace);
      success("Workspace updated successfully");
    } catch (err) {
      errorToast(err.message);
      throw err;
    }
  };

  const handleDeleteWorkspace = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) throw new Error("Failed to delete workspace");

      success("Workspace deleted successfully");
      navigate("/");
    } catch (err) {
      errorToast(err.message);
      throw err;
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <Link to="/">
            <Button variant="secondary" icon={<FiArrowLeft />}>
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <Link to="/" className="hover:text-primary-600">
            Workspaces
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{workspace.name}</span>
        </div>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {workspace.name}
            </h1>
            <p className="text-gray-600 mb-1">
              {workspace.description
                ? descriptionExpanded || workspace.description.length <= 120
                  ? workspace.description
                  : workspace.description.slice(0, 120) + "…"
                : "No description provided."}
            </p>
            {workspace.description && workspace.description.length > 120 && (
              <button
                onClick={() => setDescriptionExpanded((v) => !v)}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium mb-2"
              >
                {descriptionExpanded ? "Show less" : "Show more"}
              </button>
            )}
            <p className="text-xs text-gray-400 flex items-center">
              <FiActivity className="mr-1" /> Created on{" "}
              {new Date(workspace.created_at).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<FiSettings />}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
            data-tour="tab-overview"
            onClick={() => setActiveTab("overview")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "overview"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiActivity className="mr-2" /> Overview
          </button>
          <button
            data-tour="tab-models"
            onClick={() => setActiveTab("models")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "models"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiCpu className="mr-2" /> Models
          </button>
          <button
            data-tour="tab-datasets"
            onClick={() => setActiveTab("datasets")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "datasets"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiDatabase className="mr-2" /> Datasets
          </button>
          <button
            data-tour="tab-preprocessing"
            onClick={() => setActiveTab("preprocessing")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "preprocessing"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiLayers className="mr-2" /> Preprocessing
          </button>
          <button
            data-tour="tab-executions"
            onClick={() => setActiveTab("executions")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "executions"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiTerminal className="mr-2" /> Executions
          </button>
          <button
            data-tour="tab-optimization"
            onClick={() => setActiveTab("optimization")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "optimization"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiZap className="mr-2" /> Network Optimization
          </button>
          <button
            data-tour="tab-visualization"
            onClick={() => setActiveTab("visualization")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "visualization"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiShare2 className="mr-2" /> Network Visualization
          </button>
          <button
            data-tour="tab-settings"
            onClick={() => setActiveTab("settings")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center
              ${
                activeTab === "settings"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
              ${isReadonly ? "hidden" : ""}
            `}
          >
            <FiSettings className="mr-2" /> Settings
          </button>
        </nav>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[400px] transition-all duration-300 ease-in-out">
        {activeTab === "overview" && (
          <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">
                Workspace Overview
              </h3>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                Active
              </span>
            </div>

            <div data-tour="stats-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">Models</p>
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <FiCpu size={18} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? "..." : stats.models}
                </p>
              </div>

              <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">Datasets</p>
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <FiDatabase size={18} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? "..." : stats.datasets}
                </p>
              </div>

              <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">
                    Executions
                  </p>
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <FiTerminal size={18} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {statsLoading ? "..." : stats.executions}
                </p>
              </div>

              <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-500">
                    CO2 Emissions (g)
                  </p>
                  <div className="p-2 bg-green-50 rounded-lg text-green-600">
                    <FiCloud size={18} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 truncate">
                  {statsLoading
                    ? "..."
                    : Number(stats.co2_saved || 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-8">
              {activitiesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <ActivityList
                  activities={activities}
                  onLoadMore={loadMoreActivities}
                  hasMore={hasMoreActivities}
                  loadingMore={loadingMoreActivities}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === "datasets" && (
          <div className="animate-fade-in space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Datasets</h2>
                <p className="text-sm text-gray-500">
                  Manage and explore your datasets
                </p>
              </div>
              {!isReadonly && (
                <Link to={`/workspaces/${id}/datasets/new`}>
                  <Button className="flex items-center">
                    <FiPlus className="mr-2" /> Add Dataset
                  </Button>
                </Link>
              )}
            </div>

            {datasetsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : datasets.length > 0 ? (
              <div className="space-y-4">
                {datasets.map((dataset) => (
                  <div
                    key={dataset._id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center">
                        <div className="p-3 bg-blue-50 rounded-lg text-blue-600 mr-4">
                          {dataset.type === "image_classification" ? (
                            <FiImage size={24} />
                          ) : dataset.type === "object_detection" ? (
                            <FiGrid size={24} />
                          ) : dataset.type === "tabular" ? (
                            <FiDatabase size={24} />
                          ) : (
                            <FiLayers size={24} />
                          )}
                        </div>
                        <div>
                          <h4 className="text-lg font-medium text-gray-900">
                            {dataset.name}
                          </h4>
                          <p className="text-sm text-gray-500">
                            {dataset.description || "No description provided."}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-gray-500 block">
                          {new Date(dataset.created_at).toLocaleDateString()}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mt-1">
                          {(dataset.size_bytes / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-gray-100 pt-4 flex items-center justify-between">
                      <div className="flex items-center text-sm text-gray-600">
                        <FiFile className="mr-2" /> {dataset.file_count} Files
                      </div>
                      {dataset.classes && dataset.classes.length > 0 && (
                        <div className="flex items-center text-sm text-gray-600">
                          <FiFolder className="mr-2" /> {dataset.classes.length}{" "}
                          Classes
                        </div>
                      )}
                    </div>

                    {dataset.classes && dataset.classes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold">
                          Classes
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {dataset.classes.slice(0, 10).map((cls, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                            >
                              {cls}
                            </span>
                          ))}
                          {dataset.classes.length > 10 && (
                            <span className="text-xs text-gray-400 flex items-center">
                              +{dataset.classes.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {dataset.samples && dataset.samples.length > 0 && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <button
                          onClick={() => toggleSamples(dataset._id)}
                          className="flex items-center text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold hover:text-primary-600 focus:outline-none"
                        >
                          Sample Images
                          {expandedSamples[dataset._id] ? (
                            <FiChevronUp className="ml-1" />
                          ) : (
                            <FiChevronDown className="ml-1" />
                          )}
                        </button>
                        {expandedSamples[dataset._id] && (
                          <div className="flex gap-2 overflow-x-auto pb-2 animate-fade-in">
                            {dataset.samples.slice(0, 5).map((sample, idx) => (
                              <img
                                key={idx}
                                src={`http://localhost:8000/${sample}`}
                                alt="Sample"
                                className="h-16 w-16 object-cover rounded border border-gray-200"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src =
                                    "https://via.placeholder.com/64?text=Error";
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
                <FiDatabase className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No datasets yet
                </h3>
                <p className="text-gray-500 mb-6">
                  Upload or connect a dataset to get started.
                </p>
                <Link to={`/workspaces/${id}/datasets/new`}>
                  <Button>Add Dataset</Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === "preprocessing" && (
          <div className="animate-fade-in">
            <PreprocessingTab workspace={workspace} isReadonly={isReadonly} />
          </div>
        )}

        {activeTab === "executions" && (
          <div className="animate-fade-in">
            <ExecutionTab
              workspace={workspace}
              initialExecutionId={initialExecutionId}
              isReadonly={isReadonly}
            />
          </div>
        )}

        {activeTab === "optimization" && (
          <div className="animate-fade-in">
            <NetworkOptimizationTab workspace={workspace} isReadonly={isReadonly} />
          </div>
        )}

        {activeTab === "visualization" && (
          <div className="animate-fade-in">
            <NetworkVisualizationTab
              workspace={workspace}
              initialModel={visualizationModel}
              isReadonly={isReadonly}
            />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="animate-fade-in">
            <WorkspaceSettingsTab
              workspace={workspace}
              onUpdate={handleUpdateWorkspace}
              onDelete={handleDeleteWorkspace}
            />
          </div>
        )}

        {activeTab === "models" && (
          <div
            className="animate-fade-in space-y-6 relative"
            onDragOver={(e) => { e.preventDefault(); if (!isReadonly) setIsDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false); }}
            onDrop={handleModelDrop}
          >
            {isDragOver && !isReadonly && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary-400 bg-primary-50/80 pointer-events-none">
                <div className="flex flex-col items-center gap-3 text-primary-600">
                  <FiUpload size={40} />
                  <p className="text-base font-semibold">Drop to upload as full_model</p>
                  <p className="text-xs text-primary-500">Supported: .pt, .pth, .pkl</p>
                </div>
              </div>
            )}
            {isDragUploading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 pointer-events-none">
                <div className="flex flex-col items-center gap-3 text-primary-600">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                  <p className="text-sm font-medium">Uploading model...</p>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Models</h2>
                <p className="text-sm text-gray-500">
                  Create, fine-tune, and manage your models
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showOnlyFavoriteModels;
                    setShowOnlyFavoriteModels(next);
                    localStorage.setItem("showOnlyFavoriteModels", String(next));
                  }}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    showOnlyFavoriteModels
                      ? "bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                      : "bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100"
                  }`}
                  title={showOnlyFavoriteModels ? "Show all models" : "Show favorites only"}
                >
                  <FiStar size={13} fill={showOnlyFavoriteModels ? "currentColor" : "none"} />
                  Favorites
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showOptimizedModels;
                    setShowOptimizedModels(next);
                    localStorage.setItem("showOptimizedModels", String(next));
                  }}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    showOptimizedModels
                      ? "bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                      : "bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100"
                  }`}
                  title={showOptimizedModels ? "Hide optimized models" : "Show optimized models"}
                >
                  <FiZap size={13} />
                  {showOptimizedModels ? "Hide Optimized" : "Show Optimized"}
                </button>
                {!isReadonly && (
                  <Link to={`/workspaces/${id}/models/new`}>
                    <Button className="flex items-center">
                      <FiPlus className="mr-2" /> Create Model
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {modelsLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : models.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-6 transition-all duration-300 ease-in-out">
                {/* Models Grid */}
                <div
                  className={`transition-all duration-300 ${
                    selectedModel ? "lg:w-1/2 xl:w-7/12" : "w-full"
                  }`}
                >
                  <div
                    className={`grid gap-6 ${
                      selectedModel
                        ? "grid-cols-1 xl:grid-cols-2"
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    }`}
                  >
                    {models
                      .filter((model) => showOptimizedModels || !model.is_optimized)
                      .filter((model) => !showOnlyFavoriteModels || model.is_favorite)
                      .map((model) => (
                      <div
                        key={model._id}
                        onClick={() => handleModelSelect(model)}
                        className={`cursor-pointer border rounded-lg p-4 transition-all duration-200 ${
                          selectedModel && selectedModel._id === model._id
                            ? "border-primary-500 ring-1 ring-primary-500 shadow-md bg-blue-50/30"
                            : "border-gray-200 hover:shadow-md hover:border-primary-300"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <h4
                            className="font-medium text-gray-900 truncate"
                            title={model.name}
                          >
                            {model.name}
                          </h4>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(
                                    `http://localhost:8000/api/workspaces/${id}/models/${model._id}/favorite`,
                                    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  if (res.ok) {
                                    const updated = await res.json();
                                    setModels((prev) =>
                                      prev.map((m) => (m._id === updated._id ? { ...m, is_favorite: updated.is_favorite } : m)),
                                    );
                                  }
                                } catch (err) {
                                  console.error("Favorite error:", err);
                                }
                              }}
                              title={model.is_favorite ? "Remove from favorites" : "Add to favorites"}
                              className={`focus:outline-none transition-colors ${
                                model.is_favorite
                                  ? "text-yellow-400 hover:text-yellow-500"
                                  : "text-gray-300 hover:text-yellow-400"
                              }`}
                            >
                              <FiStar size={15} fill={model.is_favorite ? "currentColor" : "none"} />
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(
                                    `http://localhost:8000/api/workspaces/${id}/models/${model._id}/download`,
                                    { headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  if (res.ok) {
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    const cd = res.headers.get("content-disposition");
                                    let fname = model.name;
                                    if (cd) {
                                      const match = cd.match(/filename[^;=\n]*=(['"]?)([^'"\n;]*)\1/);
                                      if (match?.[2]) fname = match[2].trim();
                                    } else if (model.file_path) {
                                      const ext = model.file_path.split(".").pop();
                                      if (ext) fname = `${model.name}.${ext}`;
                                    }
                                    a.download = fname;
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    a.remove();
                                  }
                                } catch (err) {
                                  console.error("Download error:", err);
                                }
                              }}
                              title="Download model file"
                              className="text-gray-300 hover:text-primary-500 focus:outline-none transition-colors"
                            >
                              <FiDownload size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModelId(model._id);
                              }}
                              title="Delete model"
                              className={`text-gray-300 hover:text-red-500 focus:outline-none transition-colors ${
                                isReadonly ? "invisible" : ""
                              }`}
                            >
                              <FiTrash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {model.format}
                          </span>
                          {model.is_optimized && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              Optimized
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">
                          {model.description || "No description provided."}
                        </p>

                        <div className="mt-4 mb-2 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={(e) => handleVisualizeModel(e, model)}
                            title="Show network architecture"
                            className="flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none"
                          >
                            <FiEye className="mr-1" />
                            Visualize
                          </button>

                          {model.definition_file_path && (
                            <button
                              type="button"
                              onClick={(e) => handleModelToggle(e, model)}
                              className="flex items-center text-xs font-medium text-primary-600 hover:text-primary-700 focus:outline-none"
                            >
                              <FiCode className="mr-1" />
                              {selectedModel?._id === model._id
                                ? "Hide Definition"
                                : "View Definition"}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 mt-4 pt-4 border-t border-gray-100">
                          <span>
                            {new Date(model.created_at).toLocaleDateString()}
                          </span>
                          <span className="capitalize">
                            {model.status || "ready"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Detail / Code Panel */}
                {selectedModel && (
                  <div className="lg:w-1/2 xl:w-5/12 animate-fade-in">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden sticky top-6">
                      <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          {/* Editable name */}
                          {isReadonly ? (
                            <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                              <FiCpu className="text-gray-500 flex-shrink-0" />
                              {selectedModel.name}
                            </h4>
                          ) : (
                            <input
                              type="text"
                              value={editingModelName}
                              onChange={(e) => setEditingModelName(e.target.value)}
                              className="flex-1 text-sm font-semibold text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-400 min-w-0"
                              placeholder="Model name"
                            />
                          )}
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            {!isReadonly && (
                              <button
                                onClick={handleSaveModelMeta}
                                disabled={savingModelMeta}
                                className="text-gray-500 hover:text-green-600 p-1.5 rounded-full hover:bg-green-50 transition-colors disabled:opacity-50"
                                title="Save name & description"
                              >
                                {savingModelMeta ? (
                                  <div className="animate-spin rounded-full h-[18px] w-[18px] border-b-2 border-green-600" />
                                ) : (
                                  <FiSave size={18} />
                                )}
                              </button>
                            )}
                            <button
                              onClick={handleSaveDefinition}
                              className="text-gray-500 hover:text-blue-600 p-1.5 rounded-full hover:bg-blue-50 transition-colors"
                              title="Save Definition"
                            >
                              <FiCode size={18} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedModel(null);
                              }}
                              className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                            >
                              <FiX size={18} />
                            </button>
                          </div>
                        </div>
                        {/* Editable description */}
                        {isReadonly ? (
                          selectedModel.description ? (
                            <p className="text-xs text-gray-500">{selectedModel.description}</p>
                          ) : null
                        ) : (
                          <textarea
                            value={editingModelDescription}
                            onChange={(e) => setEditingModelDescription(e.target.value)}
                            rows={2}
                            className="w-full text-xs text-gray-600 bg-white border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                            placeholder="Add a description…"
                          />
                        )}
                      </div>

                      <div className="p-0">
                        {loadingDefinitions[selectedModel._id] ? (
                          <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                          </div>
                        ) : modelDefinitions[selectedModel._id] ? (
                          <WindowedCodeEditor
                            value={modelDefinitions[selectedModel._id]}
                            onChange={handleDefinitionChange}
                            fileName={selectedModel.name}
                            readOnly={false}
                            height="600px"
                            options={{
                              minimap: { enabled: true },
                              lineNumbers: "on",
                            }}
                          />
                        ) : (
                          <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed m-4">
                            <FiCode className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">
                              No definition available
                            </h3>
                            <p className="text-gray-500">
                              {!selectedModel.definition_file_path
                                ? "This model does not have a linked python file."
                                : "No definition available to display."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
                <FiCpu className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No models yet
                </h3>
                <p className="text-gray-500 mb-2">
                  Create or fine-tune a model in this workspace.
                </p>
                {!isReadonly && (
                  <p className="text-sm text-gray-400 mb-6">
                    You can also drag & drop a <code>.pt</code>, <code>.pth</code>, or <code>.pkl</code> file here to upload directly.
                  </p>
                )}
                <Link to={`/workspaces/${id}/models/new`}>
                  <Button>Create Model</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Model Confirmation Modal */}
      {deleteModelId && ReactDOM.createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Model</h3>
            <p className="text-sm text-gray-500 mb-6">
              This model and its files will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModelId(null)}
                disabled={deletingModel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteModel}
                disabled={deletingModel}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {deletingModel && (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </MainLayout>
  );
};

export default WorkspaceDetailPage;
