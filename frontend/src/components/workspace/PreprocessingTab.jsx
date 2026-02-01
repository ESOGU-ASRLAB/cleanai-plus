import React, { useState, useEffect } from "react";
import { Button, WindowedCodeEditor } from "../common";
import {
  FiPlus,
  FiTrash2,
  FiSave,
  FiCode,
  FiLayers,
  FiMove,
  FiArrowUp,
  FiArrowDown,
  FiArrowLeft,
  FiEdit2,
  FiCpu,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";

const AVAILABLE_TRANSFORMS = [
  {
    type: "Resize",
    params: { size: "(224, 224)" },
    description: "Resize the input image to the given size.",
  },
  {
    type: "CenterCrop",
    params: { size: "(224, 224)" },
    description: "Crops the given image at the center.",
  },
  {
    type: "RandomHorizontalFlip",
    params: { p: "0.5" },
    description:
      "Horizontally flip the given image randomly with a given probability.",
  },
  {
    type: "Normalize",
    params: {
      mean: "[0.485, 0.456, 0.406]",
      std: "[0.229, 0.224, 0.225]",
    },
    description: "Normalize a tensor image with mean and standard deviation.",
  },
  {
    type: "ToTensor",
    params: {},
    description: "Convert a PIL Image or numpy.ndarray to tensor.",
  },
  {
    type: "Grayscale",
    params: { num_output_channels: "1" },
    description: "Convert image to grayscale.",
  },
];

const DEFAULT_CODE = `import torch
from torchvision import transforms

def get_transform():
    """
    Standard CNN Preprocessing Pipeline
    """
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
`;

const generatePythonCode = (steps) => {
  if (!steps || steps.length === 0) return DEFAULT_CODE;

  const imports = `import torch\nfrom torchvision import transforms\n\n`;
  const transformList = steps
    .map((step) => {
      if (step.type === "ToTensor") return "    transforms.ToTensor()";

      const params = Object.entries(step.params || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");

      return `    transforms.${step.type}(${params})`;
    })
    .join(",\n");

  return `${imports}def get_transform():\n    return transforms.Compose([\n${transformList}\n    ])`;
};

const PreprocessingTab = ({ workspace }) => {
  const { token } = useAuth();
  const [view, setView] = useState("list"); // "list" | "edit" | "create"
  const [preprocessingList, setPreprocessingList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Editor State
  const [currentId, setCurrentId] = useState(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState("ui"); // "ui" or "code"
  const [code, setCode] = useState("");
  const [steps, setSteps] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchList();
  }, [workspace.id]);

  const fetchList = async () => {
    setLoadingList(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/preprocessing`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        const data = await response.json();
        setPreprocessingList(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  const handleCreateNew = () => {
    setCurrentId(null);
    setName("New Preprocessing");
    setMode("ui");
    setCode(DEFAULT_CODE);
    setSteps([]);
    setView("create");
  };

  const handleEdit = (item) => {
    setCurrentId(item.id);
    setName(item.name);
    setMode(item.mode);
    setCode(item.code || "");
    setSteps(item.steps || []);
    setView("edit");
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "Are you sure you want to delete this preprocessing definition?",
      )
    )
      return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/preprocessing/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        fetchList();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return alert("Please enter a name");

    setSaving(true);
    try {
      const payload = {
        name,
        mode,
        code,
        steps,
      };

      let url = `http://localhost:8000/api/workspaces/${workspace.id}/preprocessing`;
      let method = "POST";

      if (view === "edit" && currentId) {
        url += `/${currentId}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        fetchList();
        setView("list");
      } else {
        console.error("Failed to save preprocessing settings");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addStep = (transform) => {
    setSteps([...steps, { ...transform, id: Date.now() }]);
  };

  const removeStep = (index) => {
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
  };

  const moveStep = (index, direction) => {
    if (
      (direction === -1 && index === 0) ||
      (direction === 1 && index === steps.length - 1)
    )
      return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[index + direction];
    newSteps[index + direction] = temp;
    setSteps(newSteps);
  };

  const updateStepParam = (stepIndex, paramKey, value) => {
    const newSteps = [...steps];
    newSteps[stepIndex].params[paramKey] = value;
    setSteps(newSteps);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, index) => {
    e.dataTransfer.setData("text/plain", index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData("text/plain"));
    if (draggedIndex === index) return;

    const newSteps = [...steps];
    const [draggedItem] = newSteps.splice(draggedIndex, 1);
    newSteps.splice(index, 0, draggedItem);
    setSteps(newSteps);
  };

  if (view === "list") {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            Preprocessing Definitions
          </h3>
          <Button
            onClick={handleCreateNew}
            size="sm"
            className="flex items-center"
          >
            <FiPlus className="mr-2" />
            Create Preprocessing
          </Button>
        </div>

        {loadingList ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : preprocessingList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {preprocessingList.map((item) => (
              <div
                key={item.id}
                onClick={() => handleEdit(item)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group relative"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                      <FiCpu size={20} />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${
                            item.mode === "ui"
                              ? "bg-blue-50 text-blue-700 border-blue-100"
                              : "bg-purple-50 text-purple-700 border-purple-100"
                          }`}
                        >
                          {item.mode === "ui"
                            ? "Visual Builder"
                            : "Code Editor"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {item.mode === "ui"
                            ? `${item.steps?.length || 0} steps`
                            : "Python Script"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Last updated: {new Date(item.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
            <FiLayers className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              No preprocessing definitions
            </h3>
            <p className="text-gray-500 mb-6">
              Create a preprocessing pipeline to transform your datasets.
            </p>
            <Button onClick={handleCreateNew} variant="primary">
              Create Preprocessing
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-250px)] flex flex-col bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
      {/* Header / Toolbar */}
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setView("list")}
            className="!p-2"
          >
            <FiArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex flex-col">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Preprocessing Name"
              className="bg-transparent border-none text-gray-900 font-medium focus:ring-0 p-0 text-lg placeholder-gray-400"
            />
            <span className="text-xs text-gray-500">
              {view === "create" ? "Creating new" : "Editing"} definition
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-gray-200 rounded-lg p-1">
            <button
              onClick={() => setMode("ui")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium ${
                mode === "ui"
                  ? "bg-white text-primary-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FiLayers className="w-4 h-4" />
              Visual
            </button>
            <button
              onClick={() => {
                if (mode !== "code" && steps.length > 0) {
                  setCode(generatePythonCode(steps));
                }
                setMode("code");
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all text-sm font-medium ${
                mode === "code"
                  ? "bg-white text-primary-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FiCode className="w-4 h-4" />
              Code
            </button>
          </div>
          <Button
            onClick={handleSave}
            loading={saving}
            variant="primary"
            className="flex items-center"
          >
            <FiSave className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden p-4 bg-gray-50">
        {mode === "code" ? (
          <div className="h-full border border-gray-200 rounded-md overflow-hidden bg-white shadow-sm">
            <WindowedCodeEditor
              value={code}
              onChange={setCode}
              language="python"
              fileName={
                name
                  ? `${name.toLowerCase().replace(/\s+/g, "_")}.py`
                  : "preprocessing.py"
              }
              height="100%"
            />
          </div>
        ) : (
          <div className="h-full flex gap-4">
            {/* Library Panel */}
            <div className="w-1/3 bg-white rounded-lg p-4 border border-gray-200 flex flex-col shadow-sm">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Available Transforms
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {AVAILABLE_TRANSFORMS.map((transform, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white rounded border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-primary-700">
                        {transform.type}
                      </span>
                      <button
                        onClick={() => addStep(transform)}
                        className="p-1.5 bg-primary-50 text-primary-600 rounded-full hover:bg-primary-100 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                        title="Add to pipeline"
                      >
                        <FiPlus className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      {transform.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pipeline Panel */}
            <div className="flex-1 bg-white rounded-lg p-4 border border-gray-200 flex flex-col shadow-sm">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Pipeline Steps ({steps.length})
              </h3>
              {steps.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                  <FiLayers className="w-12 h-12 mb-2 opacity-50" />
                  <p>Add transforms from the library</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar p-1">
                  {steps.map((step, idx) => (
                    <div
                      key={step.id || idx}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, idx)}
                      className="bg-white rounded-md border border-gray-200 p-4 shadow-sm cursor-move relative hover:border-primary-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-mono border border-gray-200">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-gray-800 text-lg">
                            {step.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className={`p-1 rounded ${
                              idx === 0
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                            }`}
                          >
                            <FiArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            className={`p-1 rounded ${
                              idx === steps.length - 1
                                ? "text-gray-300 cursor-not-allowed"
                                : "text-gray-400 hover:text-primary-600 hover:bg-primary-50"
                            }`}
                          >
                            <FiArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded ml-2 transition-colors"
                            title="Remove step"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Parameters Form */}
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(step.params).map(([key, val]) => (
                          <div key={key} className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500 font-medium">
                              {key}
                            </label>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) =>
                                updateStepParam(idx, key, e.target.value)
                              }
                              className="bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded px-2 py-1.5 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all placeholder-gray-400"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreprocessingTab;
