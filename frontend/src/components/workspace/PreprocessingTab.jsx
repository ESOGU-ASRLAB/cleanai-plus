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
import { useToast } from "../../context/ToastContext";
import { useAlert } from "../../context/AlertContext";

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

const splitTopLevel = (str) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
};

const parseCodeToSteps = (code) => {
  try {
    const marker = 'transforms.Compose([';
    const idx = code.indexOf(marker);
    if (idx === -1) return null;
    let depth = 0;
    let contentStart = idx + marker.length;
    let contentEnd = -1;
    for (let i = contentStart - 1; i < code.length; i++) {
      const ch = code[i];
      if (ch === '[' || ch === '(') depth++;
      else if (ch === ']' || ch === ')') {
        depth--;
        if (depth === 0) { contentEnd = i; break; }
      }
    }
    if (contentEnd === -1) return null;
    const calls = splitTopLevel(code.slice(contentStart, contentEnd));
    const steps = [];
    for (const call of calls) {
      const trimmed = call.trim().replace(/\s+/g, ' ');
      if (!trimmed) continue;
      const match = trimmed.match(/^transforms\.(\w+)\s*\(([\s\S]*)\)$/);
      if (!match) continue;
      const type = match[1];
      const paramsStr = match[2].trim();
      const params = {};
      if (paramsStr) {
        const known = AVAILABLE_TRANSFORMS.find((t) => t.type === type);
        const knownKeys = known ? Object.keys(known.params) : [];
        let posIdx = 0;
        for (const part of splitTopLevel(paramsStr)) {
          const p = part.trim();
          if (!p) continue;
          const eqIdx = p.indexOf('=');
          if (eqIdx > 0 && /^\w+$/.test(p.slice(0, eqIdx).trim())) {
            params[p.slice(0, eqIdx).trim()] = p.slice(eqIdx + 1).trim();
          } else {
            params[knownKeys[posIdx] || `arg${posIdx}`] = p;
            posIdx++;
          }
        }
      }
      const known = AVAILABLE_TRANSFORMS.find((t) => t.type === type);
      steps.push({
        ...(known || { type, description: '' }),
        params: known ? { ...known.params, ...params } : params,
        id: Date.now() + steps.length,
      });
    }
    return steps;
  } catch (e) {
    console.error('parseCodeToSteps error:', e);
    return null;
  }
};

const PreprocessingTab = ({ workspace, isReadonly = false }) => {
  const { token } = useAuth();
  const { warning } = useToast();
  const { showConfirm } = useAlert();
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
  const [dragOverIndex, setDragOverIndex] = useState(null);

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

    const isConfirmed = await showConfirm(
      "Are you sure you want to delete this preprocessing definition?",
      "Delete Preprocessing",
      "error",
    );

    if (!isConfirmed) return;

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
    if (!name.trim()) return warning("Please enter a name");

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
  const handleLibraryDragStart = (e, transform) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "library", transform }),
    );
  };

  const handleStepDragStart = (e, index) => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "step", index }),
    );
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(index !== undefined ? index : steps.length);
  };

  const handleDragEnd = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    try {
      const dataString = e.dataTransfer.getData("application/json");
      if (!dataString) return;

      const data = JSON.parse(dataString);

      if (data.type === "library") {
        const newSteps = [...steps];
        const newStep = { ...data.transform, id: Date.now() };
        if (dropIndex !== undefined) {
          newSteps.splice(dropIndex, 0, newStep);
        } else {
          newSteps.push(newStep);
        }
        setSteps(newSteps);
      } else if (data.type === "step") {
        const draggedIndex = data.index;
        if (dropIndex === undefined) {
          const newSteps = [...steps];
          const [draggedItem] = newSteps.splice(draggedIndex, 1);
          newSteps.push(draggedItem);
          setSteps(newSteps);
        } else if (draggedIndex !== dropIndex) {
          const newSteps = [...steps];
          const [draggedItem] = newSteps.splice(draggedIndex, 1);
          newSteps.splice(dropIndex, 0, draggedItem);
          setSteps(newSteps);
        }
      }
    } catch (err) {
      console.error("Drop error:", err);
    }
  };

  if (view === "list") {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              Preprocessing Definitions
            </h2>
            <p className="text-sm text-gray-500">
              Create and manage data transformation pipelines
            </p>
          </div>
          {!isReadonly && (
            <Button onClick={handleCreateNew} className="flex items-center">
              <FiPlus className="mr-2" />
              Create Preprocessing
            </Button>
          )}
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
                              : "bg-indigo-50 text-indigo-700 border-indigo-100"
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
                  {!isReadonly && (
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <FiTrash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Last updated: {new Date(item.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
            <FiLayers className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              No preprocessing definitions
            </h3>
            <p className="text-gray-500 mb-6">
              Create a preprocessing pipeline to transform your datasets.
            </p>
            {!isReadonly && (
              <Button onClick={handleCreateNew} variant="primary">
                Create Preprocessing
              </Button>
            )}
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
              onChange={isReadonly ? undefined : (e) => setName(e.target.value)}
              readOnly={isReadonly}
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
              onClick={() => {
                if (mode === "code") {
                  const parsed = parseCodeToSteps(code);
                  if (parsed !== null) setSteps(parsed);
                }
                setMode("ui");
              }}
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
          {!isReadonly && (
            <Button
              onClick={handleSave}
              loading={saving}
              variant="primary"
              className="flex items-center"
            >
              <FiSave className="w-4 h-4 mr-2" />
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden p-4 bg-gray-50">
        {mode === "code" ? (
          <div className="h-full border border-gray-200 rounded-md overflow-hidden bg-white shadow-sm">
            <WindowedCodeEditor
              value={code}
              onChange={isReadonly ? undefined : setCode}
              language="python"
              fileName={
                name
                  ? `${name.toLowerCase().replace(/\s+/g, "_")}.py`
                  : "preprocessing.py"
              }
              height="100%"
              readOnly={isReadonly}
            />
          </div>
        ) : (
          <div className="h-full flex gap-4">
            {/* Library Panel */}
            {!isReadonly && (
            <div className="w-1/3 bg-white rounded-lg p-4 border border-gray-200 flex flex-col shadow-sm">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Available Transforms
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {AVAILABLE_TRANSFORMS.map((transform, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleLibraryDragStart(e, transform)}
                    onDragEnd={handleDragEnd}
                    className="p-3 bg-white rounded border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all group cursor-grab active:cursor-grabbing"
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
            )}

            {/* Pipeline Panel */}
            <div
              className="flex-1 bg-white rounded-lg p-4 border border-gray-200 flex flex-col shadow-sm"
              onDragOver={!isReadonly ? (e) => handleDragOver(e) : undefined}
              onDrop={!isReadonly ? (e) => handleDrop(e) : undefined}
            >
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Pipeline Steps ({steps.length})
              </h3>
              {steps.length === 0 ? (
                <div
                  className={`flex-1 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-lg transition-colors ${!isReadonly && dragOverIndex !== null ? "border-primary-400 bg-primary-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <FiLayers
                    className={`w-12 h-12 mb-2 ${!isReadonly && dragOverIndex !== null ? "text-primary-400 opacity-100" : "opacity-50"}`}
                  />
                  <p>{isReadonly ? "No transform steps defined" : "Drag and drop transforms here"}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar p-1">
                  {steps.map((step, idx) => (
                    <React.Fragment key={step.id || idx}>
                      {dragOverIndex === idx && (
                        <div className="h-1.5 bg-primary-400 rounded-full shadow-sm border border-primary-200 transition-all"></div>
                      )}
                      <div
                        draggable={!isReadonly}
                        onDragStart={!isReadonly ? (e) => handleStepDragStart(e, idx) : undefined}
                        onDragEnd={!isReadonly ? handleDragEnd : undefined}
                        onDragOver={!isReadonly ? (e) => handleDragOver(e, idx) : undefined}
                        onDrop={!isReadonly ? (e) => handleDrop(e, idx) : undefined}
                        className={`bg-white rounded-md border border-gray-200 p-4 shadow-sm relative hover:border-primary-300 transition-colors ${isReadonly ? "cursor-default" : "cursor-move"}`}
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
                            {!isReadonly && (
                            <>
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
                            </>
                            )}
                            {!isReadonly && (
                              <button
                                onClick={() => removeStep(idx)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded ml-2 transition-colors"
                                title="Remove step"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )}
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
                                onChange={isReadonly ? undefined : (e) =>
                                  updateStepParam(idx, key, e.target.value)
                                }
                                readOnly={isReadonly}
                                className={`bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded px-2 py-1.5 outline-none transition-all placeholder-gray-400 ${isReadonly ? "cursor-default" : "focus:ring-1 focus:ring-primary-500 focus:border-primary-500"}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                  {dragOverIndex === steps.length && steps.length > 0 && (
                    <div className="h-1.5 bg-primary-400 rounded-full shadow-sm border border-primary-200 transition-all mt-3"></div>
                  )}
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
