import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { MainLayout } from "../components/layout";
import { Button, CodeEditor, WindowedCodeEditor } from "../components/common";
import PreprocessingTab from "../components/workspace/PreprocessingTab";
import ExecutionTab from "../components/workspace/ExecutionTab";
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
} from "react-icons/fi";

const WorkspaceDetailPage = () => {
  const { id } = useParams();
  const { token } = useAuth();
  const { success, error: errorToast } = useToast();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Models state
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelDefinitions, setModelDefinitions] = useState({});
  const [loadingDefinitions, setLoadingDefinitions] = useState({});

  // Datasets state
  const [datasets, setDatasets] = useState([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [expandedSamples, setExpandedSamples] = useState({});

  // Activities state
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const toggleSamples = (datasetId) => {
    setExpandedSamples((prev) => ({
      ...prev,
      [datasetId]: !prev[datasetId],
    }));
  };

  const handleModelSelect = async (model) => {
    // If already selected, do nothing
    if (selectedModel?._id === model._id) {
      return;
    }

    setSelectedModel(model);

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
          `http://localhost:8000/api/workspaces/${id}/activities`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setActivities(data);
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
            <p className="text-gray-600">
              {workspace.description || "No description provided."}
            </p>
          </div>
          <Button variant="secondary" icon={<FiSettings />}>
            Settings
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8">
          <button
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
        </nav>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[400px]">
        {activeTab === "overview" && (
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Workspace Overview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Created At</p>
                <p className="font-medium">
                  {new Date(workspace.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Owner ID</p>
                <p className="font-medium truncate" title={workspace.owner_id}>
                  {workspace.owner_id}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Status</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Recent Activity
              </h3>
              {activitiesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              ) : activities.length > 0 ? (
                <div className="flow-root">
                  <ul className="-mb-8">
                    {activities.map((activity, activityIdx) => (
                      <li key={activity.id || activity._id || activityIdx}>
                        <div className="relative pb-8">
                          {activityIdx !== activities.length - 1 ? (
                            <span
                              className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                              aria-hidden="true"
                            />
                          ) : null}
                          <div className="relative flex space-x-3">
                            <div>
                              <span className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center ring-8 ring-white">
                                <FiActivity
                                  className="h-5 w-5 text-blue-600"
                                  aria-hidden="true"
                                />
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                              <div>
                                <p className="text-sm text-gray-500">
                                  {activity.action === "workspace_created" ? (
                                    <span className="font-medium text-gray-900">
                                      Workspace created
                                    </span>
                                  ) : activity.action === "model_uploaded" ? (
                                    <span>
                                      Uploaded model{" "}
                                      <span className="font-medium text-gray-900">
                                        {activity.details?.model_name}
                                      </span>
                                    </span>
                                  ) : activity.action === "dataset_created" ? (
                                    <span>
                                      Created dataset{" "}
                                      <span className="font-medium text-gray-900">
                                        {activity.details?.dataset_name}
                                      </span>
                                    </span>
                                  ) : (
                                    activity.action
                                  )}
                                </p>
                              </div>
                              <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                {new Date(
                                  activity.created_at,
                                ).toLocaleDateString()}{" "}
                                {new Date(
                                  activity.created_at,
                                ).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No recent activity.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "datasets" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Datasets</h3>
              <Link to={`/workspaces/${id}/datasets/new`}>
                <Button size="sm">Add Dataset</Button>
              </Link>
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
                          <div className="flex gap-2 overflow-x-auto pb-2 animate-fade-in-up">
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
              <div className="text-center py-12">
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
          <div>
            <PreprocessingTab workspace={workspace} />
          </div>
        )}

        {activeTab === "executions" && (
          <div>
            <ExecutionTab workspace={workspace} />
          </div>
        )}

        {activeTab === "models" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Models</h3>
              <Link to={`/workspaces/${id}/models/new`}>
                <Button size="sm">Create Model</Button>
              </Link>
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
                    {models.map((model) => (
                      <div
                        key={model._id}
                        onClick={() => handleModelSelect(model)}
                        className={`cursor-pointer border rounded-lg p-4 transition-all duration-200 ${
                          selectedModel && selectedModel._id === model._id
                            ? "border-primary-500 ring-1 ring-primary-500 shadow-md bg-blue-50/30"
                            : "border-gray-200 hover:shadow-md hover:border-primary-300"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4
                            className="font-medium text-gray-900 truncate"
                            title={model.name}
                          >
                            {model.name}
                          </h4>
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                            {model.format}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">
                          {model.description || "No description provided."}
                        </p>

                        {model.definition_file_path && (
                          <div className="mt-4 mb-2">
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
                          </div>
                        )}

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
                  <div className="lg:w-1/2 xl:w-5/12 animate-fade-in-up md:animate-slide-in-right">
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden sticky top-6">
                      <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                        <h4 className="font-medium text-gray-900 flex items-center gap-2">
                          <FiCode className="text-gray-500" />
                          Model Definition: {selectedModel.name}
                        </h4>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={handleSaveDefinition}
                            className="text-gray-500 hover:text-green-600 p-1.5 rounded-full hover:bg-green-50 transition-colors"
                            title="Save Definition"
                          >
                            <FiSave size={18} />
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
                          <div className="text-center py-20 text-gray-500 bg-gray-50">
                            <p>No definition available to display.</p>
                            {!selectedModel.definition_file_path && (
                              <p className="text-xs mt-2">
                                This model does not have a linked python file.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <FiCpu className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No models yet
                </h3>
                <p className="text-gray-500 mb-6">
                  Create or fine-tune a model in this workspace.
                </p>
                <Link to={`/workspaces/${id}/models/new`}>
                  <Button>Create Model</Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default WorkspaceDetailPage;
