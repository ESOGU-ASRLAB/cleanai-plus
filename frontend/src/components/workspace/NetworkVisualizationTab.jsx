import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import {
  FiCpu,
  FiLayers,
  FiActivity,
  FiArrowRight,
  FiRefreshCw,
  FiBox,
} from "react-icons/fi";

const NetworkVisualizationTab = ({ workspace, initialModel, isReadonly = false }) => {
  const { token } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(initialModel || null);
  const [layers, setLayers] = useState([]);
  const [layersLoading, setLayersLoading] = useState(false);
  const [converting, setConverting] = useState(false);

  // Handle both id (from serialized JSON) and _id (from raw Mongo object)
  const workspaceId = workspace.id || workspace._id;

  const fetchModels = async () => {
    // We don't want to set global loading on refresh always, maybe just inside
    // But for simplicity reuse loading state or keep it silent
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/models/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        setModels(data);
        // If no model selected, select first
        if (!selectedModel && data.length > 0) {
          setSelectedModel(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch models", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchModels().finally(() => setLoading(false));
  }, [workspace, token]);

  const handleConvert = async () => {
    if (!selectedModel) return;
    if (selectedModel.format === "onnx") return;

    const confirmed = await showConfirm(
      "Convert this model to ONNX? This creates a new model file.",
      "Convert Model",
      "warning",
    );
    if (!confirmed) return;

    setConverting(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/models/${selectedModel._id}/convert?target_format=onnx`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.ok) {
        const newModel = await response.json();
        showAlert("Model converted successfully!", "Success", "success");
        // Refresh list
        await fetchModels();
        // Switch to new model
        setSelectedModel(newModel);
      } else {
        const err = await response.json();
        showAlert(`Conversion failed: ${err.detail}`, "Error", "error");
      }
    } catch (e) {
      console.error(e);
      showAlert("Conversion error", "Error", "error");
    } finally {
      setConverting(false);
    }
  };

  useEffect(() => {
    const fetchStructure = async () => {
      if (!selectedModel) {
        setLayers([]);
        return;
      }

      setLayersLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/workspaces/${workspaceId}/models/${selectedModel._id}/structure`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setLayers(data);
        } else {
          console.error("Failed to fetch structure");
          setLayers([]);
        }
      } catch (err) {
        console.error("Error fetching structure:", err);
        setLayers([]);
      } finally {
        setLayersLoading(false);
      }
    };

    fetchStructure();
  }, [selectedModel, workspace, token]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">
            Network Visualization
          </h2>
          <p className="text-sm text-gray-500">
            Explore and analyze your model architectures
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-250px)] min-h-[600px]">
        {/* Sidebar: Model List */}
        <div className="w-full lg:w-1/4 border-r border-gray-200 pr-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <FiCpu className="mr-2" /> Models
            </h3>
            <button
              onClick={fetchModels}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
            >
              <FiRefreshCw size={14} />
            </button>
          </div>

          {models.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg border border-gray-200 border-dashed">
              <FiCpu className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">No models found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((model) => (
                <button
                  key={model._id}
                  onClick={() => setSelectedModel(model)}
                  className={`w-full text-left p-3 rounded-md border transition-all ${
                    selectedModel && selectedModel._id === model._id
                      ? "border-primary-500 bg-primary-50 text-primary-700 shadow-sm"
                      : "border-gray-200 hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <div className="font-medium truncate">{model.name}</div>
                  <div className="text-xs text-gray-500 mt-1 flex justify-between">
                    <span>{model.format}</span>
                    <span>
                      {new Date(model.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Area: Visualization */}
        <div className="w-full lg:w-3/4 bg-slate-50 rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {selectedModel ? (
            <>
              <div className="bg-white border-b border-gray-200 p-4 flex justify-between items-center shadow-sm z-10">
                <div>
                  <h3 className="font-semibold text-gray-800 flex items-center">
                    <FiLayers className="mr-2 text-primary-600" />
                    {selectedModel.name} Structure
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Visualize neural network architecture
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/workspaces/${workspaceId}/models/${selectedModel._id}/3d`}
                  >
                    <button className="flex items-center px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 transition-colors shadow-sm">
                      <FiBox className="mr-1.5" />
                      Show 3D Architecture
                    </button>
                  </Link>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                      {selectedModel.format}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                      v{selectedModel.version}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-8 relative">
                {layersLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : layers.length > 0 ? (
                  <div className="max-w-3xl mx-auto relative pb-20">
                    {/* Connecting Line */}
                    <div className="absolute left-1/2 top-4 bottom-0 w-0.5 bg-gray-300 -translate-x-1/2 z-0"></div>

                    {layers.map((layer, index) => (
                      <div
                        key={index}
                        className="relative z-10 mb-8 last:mb-0 group"
                      >
                        <div className="flex items-center justify-center">
                          <div
                            className={`w-64 p-4 rounded-lg border shadow-sm transition-transform hover:scale-105 hover:shadow-md bg-white ${layer.color} border-l-4`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span
                                className="font-bold text-gray-800 text-sm truncate"
                                title={layer.name}
                              >
                                {layer.type}
                              </span>
                              <span className="text-xs text-gray-400 font-mono">
                                #{index + 1}
                              </span>
                            </div>
                            {layer.details && (
                              <div className="text-[10px] text-gray-600 font-mono mb-1 truncate px-1 bg-white/50 rounded">
                                {layer.details}
                              </div>
                            )}
                            <div className="text-xs text-gray-600 font-mono mb-1 truncate">
                              Shape: {layer.shape}
                            </div>
                            {layer.params > 0 && (
                              <div className="text-xs text-gray-500">
                                Params: {layer.params.toLocaleString()}
                              </div>
                            )}
                            <div
                              className="text-[10px] text-gray-400 mt-1 truncate"
                              title={layer.name}
                            >
                              {layer.name}
                            </div>
                          </div>

                          {/* Tooltip on right side */}
                          <div className="absolute left-[calc(50%+9rem)] hidden group-hover:block ml-4 bg-gray-800 text-white text-xs p-2 rounded w-48 z-20 shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200">
                            <div className="font-semibold mb-1">
                              {layer.type} Layer
                            </div>
                            <div>Layer Name: {layer.name}</div>
                          </div>

                          {/* Connector Arrow */}
                          {index < layers.length - 1 && (
                            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-gray-400 z-10 bg-slate-50">
                              <FiArrowRight className="rotate-90" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-gray-200 border-dashed m-4">
                    <FiLayers className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No layer structure available
                    </h3>
                    <p className="text-gray-500">
                      Ensure the model is a valid state_dict or has been
                      processed.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-gray-200 border-dashed m-4">
              <FiActivity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No model selected
              </h3>
              <p className="text-gray-500">
                Select a model from the list to view its architecture.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default NetworkVisualizationTab;
