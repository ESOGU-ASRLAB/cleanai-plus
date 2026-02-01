import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout";
import { Button, Input, Stepper } from "../components/common";
import {
  FiSave,
  FiUploadCloud,
  FiFolder,
  FiFile,
  FiImage,
  FiDatabase,
  FiGrid,
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiChevronDown,
  FiChevronUp,
  FiLayers,
  FiEdit2,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import * as XLSX from "xlsx";

const DATASET_TYPES = [
  {
    id: "pickle_batch",
    title: "Python Pickle / Batch",
    icon: FiLayers,
    description:
      "Binary pickle files (e.g. CIFAR-10/100, custom arrays) containing data and labels.",
    color: "border-orange-500 bg-orange-50",
  },
  {
    id: "image_classification",
    title: "Image Classification",
    icon: FiImage,
    description: "Images organized in folders by class (e.g., cats/img1.jpg).",
    color: "border-blue-500 bg-blue-50",
  },
  {
    id: "object_detection",
    title: "Object Detection",
    icon: FiGrid,
    description:
      "Images with associated bounding box annotations (COCO, YOLO).",
    color: "border-green-500 bg-green-50",
  },
  {
    id: "tabular",
    title: "Tabular Data",
    icon: FiDatabase,
    description: "CSV, Parquet, or Excel files containing structured data.",
    color: "border-purple-500 bg-purple-50",
  },
  {
    id: "other",
    title: "Other / Unstructured",
    icon: FiLayers,
    description: "Text files, raw binaries, or mixed content.",
    color: "border-gray-500 bg-gray-50",
  },
];

const FilePreview = ({ file }) => {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  if (file.type.startsWith("image/") && preview) {
    return (
      <img
        src={preview}
        alt={file.name}
        className="h-8 w-8 object-cover rounded border border-gray-200 mr-3"
      />
    );
  }

  return <FiFile className="mr-3 text-gray-400" size={16} />;
};

const readFileHead = (file) => {
  return new Promise((resolve) => {
    const name = file.name.toLowerCase();

    // EXCEL Support
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            range: 0, // start from the beginning
            defval: "", // default value for empty cells
          });

          if (jsonData.length > 0) {
            const headers = jsonData[0];
            const rows = jsonData.slice(1, 11); // Take up to 10 rows
            resolve({ headers, rows, sheetName: firstSheetName });
          } else {
            resolve(null);
          }
        } catch (err) {
          console.error("Excel parse error:", err);
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    }
    // CSV / TXT / TSV Support
    else if (
      name.endsWith(".csv") ||
      name.endsWith(".txt") ||
      name.endsWith(".tsv")
    ) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text
          .split(/\r\n|\n/)
          .filter((line) => line.trim() !== "")
          .slice(0, 11); // Header + 10 lines
        if (lines.length > 0) {
          const delimiter = name.endsWith(".tsv") ? "\t" : ",";
          // Naive split
          const headers = lines[0].split(delimiter).map((h) => h.trim());
          const rows = lines
            .slice(1)
            .map((line) => line.split(delimiter).map((c) => c.trim()));
          resolve({ headers, rows });
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file.slice(0, 50 * 1024)); // Read first 50KB to cover 10 rows safely
    } else {
      resolve(null);
    }
  });
};

const readTextFileHead = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text
        .split(/\r\n|\n/)
        .slice(0, 10) // First 10 lines
        .join("\n");
      resolve(lines);
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file.slice(0, 50 * 1024)); // Read first 50KB
  });
};

const NewDatasetPage = () => {
  const { id: workspaceId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { error, warning } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "image_classification",
  });

  const [files, setFiles] = useState([]);
  const [previewData, setPreviewData] = useState({
    totalSize: 0,
    classes: {},
    fileCount: 0,
  });
  const [schemaInfo, setSchemaInfo] = useState({}); // { [filename]: { target: "", excluded: [] } }
  const [datasetSettings, setDatasetSettings] = useState({}); // Global settings like annotation_format
  const [expandedClasses, setExpandedClasses] = useState({});
  const [editingClass, setEditingClass] = useState(null);
  const [editValue, setEditValue] = useState("");
  // Map<File, string> to track the class name for each file
  const [fileClassMap, setFileClassMap] = useState(new Map());

  const folderInputRef = useRef(null);
  const filesInputRef = useRef(null);

  const steps = [
    { id: 1, title: "Basic Info" },
    { id: 2, title: "Dataset Type" },
    { id: 3, title: "Upload Data" },
    { id: 4, title: "Preview" },
    { id: 5, title: "Overview" },
  ];

  const handleStartEdit = (e, className) => {
    e.stopPropagation();
    setEditingClass(className);
    setEditValue(className);
  };

  const handleSaveEdit = (e, oldName) => {
    e.stopPropagation();
    if (editValue && editValue.trim() !== oldName) {
      const newName = editValue.trim();
      if (previewData.classes[newName]) {
        warning("Class name already exists!");
        // Don't close edit mode so user can fix it
        return;
      }

      const newClasses = { ...previewData.classes };
      newClasses[newName] = newClasses[oldName];
      delete newClasses[oldName];

      setPreviewData((prev) => ({
        ...prev,
        classes: newClasses,
      }));

      // Update file associations in Map
      setFileClassMap((prev) => {
        const newMap = new Map(prev);
        for (const [file, cls] of newMap.entries()) {
          if (cls === oldName) {
            newMap.set(file, newName);
          }
        }
        return newMap;
      });

      // Update expansion state
      setExpandedClasses((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });
    }
    setEditingClass(null);
    setEditValue("");
  };

  const handleKeyDown = (e, oldName) => {
    if (e.key === "Enter") {
      handleSaveEdit(e, oldName);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setEditingClass(null);
    }
  };

  const getSelectedType = () =>
    DATASET_TYPES.find((t) => t.id === formData.type);

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    processFiles(selected);
  };

  const processFiles = async (fileList) => {
    setFiles(fileList);

    // Analyze for preview
    let size = 0;
    const classes = {};
    const newFileClassMap = new Map();
    const tabularPreviews = {};
    const otherPreviews = {};

    for (const f of fileList) {
      size += f.size;

      if (formData.type === "tabular") {
        const className = "Data Files"; // Consistent group for tabular
        newFileClassMap.set(f, className);

        if (!classes[className]) {
          classes[className] = {
            count: 0,
            size: 0,
            samples: [],
          };
        }
        classes[className].count += 1;
        classes[className].size += f.size;
        if (classes[className].samples.length < 5) {
          classes[className].samples.push(f);
        }

        // Generate preview for first few tabular files
        if (
          Object.keys(tabularPreviews).length < 3 &&
          (f.name.endsWith(".csv") ||
            f.name.endsWith(".txt") ||
            f.name.endsWith(".tsv") ||
            f.name.endsWith(".xlsx") ||
            f.name.endsWith(".xls"))
        ) {
          try {
            const preview = await readFileHead(f);
            if (preview) {
              tabularPreviews[f.name] = preview;
            }
          } catch (e) {
            console.error("Preview generation failed", e);
          }
        }
      } else if (formData.type === "other") {
        const className = "Unstructured Data";
        newFileClassMap.set(f, className);

        if (!classes[className]) {
          classes[className] = {
            count: 0,
            size: 0,
            samples: [],
          };
        }
        classes[className].count += 1;
        classes[className].size += f.size;
        if (classes[className].samples.length < 5) {
          classes[className].samples.push(f);
        }

        // Generate preview for text-based files
        // Check manually for common text extensions or if type starts with text
        const isTextCandidate =
          f.type.startsWith("text/") ||
          f.name.match(/\.(txt|md|json|xml|yaml|yml|py|js|html|css|log|ini)$/i);

        if (Object.keys(otherPreviews).length < 3 && isTextCandidate) {
          try {
            const preview = await readTextFileHead(f);
            if (preview) {
              otherPreviews[f.name] = preview;
            }
          } catch (e) {
            console.error("Preview generation failed", e);
          }
        }
      } else {
        // Standard Image/Object Detection logic
        let className = "Uncategorized";

        // Try to infer class from path: class/img.jpg
        const path = f.webkitRelativePath || f.name;
        const parts = path.split("/");

        if (parts.length > 1) {
          // Simple heuristic: Parent directory name
          if (f.webkitRelativePath) {
            const pathParts = f.webkitRelativePath.split("/");
            if (pathParts.length >= 2) {
              // If depth > 2 (Root/Class/Img), use pathParts[pathParts.length - 2]
              // If depth == 2 (Class/Img), use pathParts[0]
              if (pathParts.length > 2) {
                className = pathParts[pathParts.length - 2];
              } else {
                className = pathParts[0];
              }
            }
          }
        }

        newFileClassMap.set(f, className);

        if (!classes[className]) {
          classes[className] = {
            count: 0,
            size: 0,
            samples: [],
          };
        }

        classes[className].count += 1;
        classes[className].size += f.size;
        if (classes[className].samples.length < 5) {
          classes[className].samples.push(f);
        }
      }
    }

    setFileClassMap(newFileClassMap);
    setPreviewData({
      totalSize: size,
      classes: classes,
      fileCount: fileList.length,
      tabularPreviews,
      otherPreviews,
    });
  };

  const toggleClass = (className) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [className]: !prev[className],
    }));
  };

  const isNextDisabled = () => {
    if (currentStep === 1 && !formData.name) return true;
    if (currentStep === 3 && files.length === 0) return true;
    return false;
  };

  const handleNext = () => {
    // Validation is now handled by disabling the button
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const data = new FormData();
      data.append("name", formData.name);
      data.append("description", formData.description);
      data.append("type", formData.type);

      // Batching might be needed for huge datasets, but for MVP send all
      const paths = [];
      files.forEach((file) => {
        data.append("files", file);
        // Use the edited class name to construct the path
        const className = fileClassMap.get(file) || "Uncategorized";
        // Always reconstruct path as className/filename for the backend
        paths.push(`${className}/${file.name}`);
      });
      // Combine file-specific schema info with global dataset settings
      const finalSchema = {
        files: schemaInfo,
        ...datasetSettings,
      };

      data.append("schema_info", JSON.stringify(finalSchema));
      data.append("paths_json", JSON.stringify(paths));

      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/datasets/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: data,
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to upload dataset");
      }

      navigate(`/workspaces/${workspaceId}`); // Or to dataset detail
    } catch (err) {
      error("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Create New Dataset
          </h1>
          <p className="text-gray-500">
            Upload and organize your data for training and inference.
          </p>
        </div>

        {/* Stepper */}
        <Stepper steps={steps} currentStep={currentStep} />

        <div className="space-y-8">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Dataset Details
              </h2>
              <div className="space-y-4">
                <Input
                  label="Dataset Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. Cat vs Dog V1"
                  required
                  autoFocus
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2 border"
                    rows="4"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Description of the dataset..."
                  />
                </div>
              </div>
            </section>
          )}

          {/* Step 2: Type */}
          {currentStep === 2 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Dataset Type
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {DATASET_TYPES.map((t) => {
                  const Icon = t.icon;
                  const isSelected = formData.type === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setFormData({ ...formData, type: t.id })}
                      className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none transition-all ${isSelected ? `${t.color} ring-2 ring-offset-2 ring-primary-500` : "border-gray-300 bg-white hover:bg-gray-50"}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center">
                          <div
                            className={`p-2 rounded-md ${isSelected ? "bg-white bg-opacity-50" : "bg-gray-100"}`}
                          >
                            <Icon
                              className={`h-6 w-6 ${isSelected ? "text-gray-900" : "text-gray-500"}`}
                            />
                          </div>
                          <div className="ml-3">
                            <span className="block text-sm font-medium text-gray-900">
                              {t.title}
                            </span>
                            <span className="block text-sm text-gray-500 mt-1">
                              {t.description}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`h-5 w-5 rounded-full border flex items-center justify-center ${isSelected ? "border-primary-600 bg-primary-600" : "border-gray-300"}`}
                        >
                          {isSelected && (
                            <div className="h-2.5 w-2.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Step 3: Upload */}
          {currentStep === 3 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Upload Files
              </h2>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-12 bg-gray-50">
                <FiUploadCloud className="h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  Select Data Source
                </h3>
                <p className="text-gray-500 mb-8 text-center max-w-sm">
                  Choose a folder containing your dataset structure, or select
                  multiple files.
                </p>

                <div className="flex space-x-4">
                  <button
                    onClick={() => filesInputRef.current.click()}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center"
                  >
                    <FiFile className="mr-2" /> Select Files
                  </button>
                  <button
                    onClick={() => folderInputRef.current.click()}
                    className="px-4 py-2 bg-primary-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center"
                  >
                    <FiFolder className="mr-2" /> Select Folder
                  </button>
                </div>

                {/* Hidden Inputs */}
                <input
                  type="file"
                  multiple
                  ref={filesInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  type="file"
                  multiple
                  {...{ webkitdirectory: "", directory: "" }}
                  ref={folderInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <div className="mt-6 p-4 bg-green-50 rounded-md border border-green-200 flex items-center justify-between">
                  <div className="flex items-center">
                    <FiCheck className="text-green-600 mr-2" />
                    <span className="text-green-800 font-medium">
                      {files.length} files selected
                    </span>
                  </div>
                  <span className="text-green-700 text-sm">
                    {(previewData.totalSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              )}
            </section>
          )}

          {/* Step 4: Preview */}
          {currentStep === 4 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Dataset Preview
              </h2>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500">Total Files</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {previewData.fileCount}
                  </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-500">Total Size</div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {(previewData.totalSize / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              </div>

              {formData.type === "tabular" &&
              previewData.tabularPreviews &&
              Object.keys(previewData.tabularPreviews).length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Data Preview (First 10 Rows)
                  </h3>
                  <div className="space-y-6">
                    {Object.entries(previewData.tabularPreviews).map(
                      ([filename, data]) => (
                        <div
                          key={filename}
                          className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
                        >
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-medium text-sm flex items-center justify-between text-gray-700">
                            <div className="flex items-center">
                              <FiDatabase className="mr-2 text-purple-500" />
                              <span className="font-semibold">{filename}</span>
                              {data.sheetName && (
                                <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                  Sheet: {data.sheetName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center">
                                <label className="text-xs mr-2 font-medium">
                                  Target Column:
                                </label>
                                <select
                                  className="text-xs border-gray-300 rounded shadow-sm focus:border-purple-500 focus:ring-purple-500"
                                  value={schemaInfo[filename]?.target || ""}
                                  onChange={(e) =>
                                    setSchemaInfo((prev) => ({
                                      ...prev,
                                      [filename]: {
                                        ...prev[filename],
                                        target: e.target.value,
                                      },
                                    }))
                                  }
                                >
                                  <option value="">-- None --</option>
                                  {data.headers.map((h, i) => (
                                    <option key={i} value={h || `Col ${i + 1}`}>
                                      {h || `Col ${i + 1}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <span className="text-xs text-gray-500">
                                Previewing {data.rows.length} rows
                              </span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  {data.headers.map((h, i) => {
                                    const colName = h || `Col ${i + 1}`;
                                    const isTarget =
                                      schemaInfo[filename]?.target === colName;
                                    return (
                                      <th
                                        key={i}
                                        className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider border-r border-gray-100 last:border-0 ${isTarget ? "bg-purple-100 text-purple-700 border-b-2 border-b-purple-500" : "text-gray-500"}`}
                                      >
                                        {colName}
                                        {isTarget && (
                                          <span className="ml-1 text-xs bg-purple-200 px-1 rounded">
                                            Target
                                          </span>
                                        )}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {data.rows.map((row, i) => (
                                  <tr
                                    key={i}
                                    className="hover:bg-gray-50 transition-colors"
                                  >
                                    {row.map((cell, j) => (
                                      <td
                                        key={j}
                                        className="px-3 py-2 whitespace-nowrap text-gray-600 border-r border-gray-100 last:border-0"
                                      >
                                        {cell !== null && cell !== undefined
                                          ? String(cell)
                                          : ""}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
              {formData.type === "other" &&
              previewData.otherPreviews &&
              Object.keys(previewData.otherPreviews).length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Text Content Preview (First 10 Lines)
                  </h3>
                  <div className="space-y-6">
                    {Object.entries(previewData.otherPreviews).map(
                      ([filename, content]) => (
                        <div
                          key={filename}
                          className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm"
                        >
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 font-medium text-sm flex items-center text-gray-700">
                            <FiFile className="mr-2 text-gray-500" />
                            {filename}
                          </div>
                          <div className="p-4 bg-gray-50 overflow-x-auto">
                            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap">
                              {content}
                            </pre>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : null}

              {/* Object Detection Specific Settings */}
              {formData.type === "object_detection" && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-green-800 mb-3 flex items-center">
                    <FiGrid className="mr-2" /> Dataset Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-green-700 mb-1">
                        Annotation Format
                      </label>
                      <select
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-green-500 focus:ring-green-500 text-sm"
                        value={datasetSettings.annotation_format || ""}
                        onChange={(e) =>
                          setDatasetSettings((prev) => ({
                            ...prev,
                            annotation_format: e.target.value,
                          }))
                        }
                      >
                        <option value="">-- Select Format --</option>
                        <option value="yolo">YOLO (txt per image)</option>
                        <option value="coco">COCO (single json)</option>
                        <option value="pascal_voc">
                          Pascal VOC (xml per image)
                        </option>
                        <option value="open_images">Open Images</option>
                        <option value="kitti">KITTI</option>
                      </select>
                      <p className="mt-1 text-xs text-green-600">
                        Required for training. Specifies how the bounding boxes
                        are encoded.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Other/Unstructured Specific Settings */}
              {formData.type === "other" && (
                <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-800 mb-3 flex items-center">
                    <FiLayers className="mr-2" /> Data Content Type
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Primary Modality
                      </label>
                      <select
                        className="w-full border-gray-300 rounded-md shadow-sm focus:border-gray-500 focus:ring-gray-500 text-sm"
                        value={datasetSettings.modality || ""}
                        onChange={(e) =>
                          setDatasetSettings((prev) => ({
                            ...prev,
                            modality: e.target.value,
                          }))
                        }
                      >
                        <option value="">-- Select Type --</option>
                        <option value="text">Natural Language (Text)</option>
                        <option value="audio">Audio / Speech</option>
                        <option value="video">Video</option>
                        <option value="timeseries">Time Series (Raw)</option>
                        <option value="mixed">Mixed / Multimodal</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {formData.type !== "tabular" &&
                formData.type !== "other" &&
                Object.keys(previewData.classes).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-2">
                      Detected Classes (Folder Structure)
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                      {Object.entries(previewData.classes).map(
                        ([className, stats]) => {
                          const isExpanded = expandedClasses[className];
                          return (
                            <div
                              key={className}
                              className="flex flex-col hover:bg-gray-50 transition-colors"
                            >
                              <div
                                className="px-4 py-3 flex justify-between items-center cursor-pointer"
                                onClick={() => toggleClass(className)}
                              >
                                <div className="flex items-center flex-1">
                                  <div
                                    className={`p-1 rounded mr-2 transition-transform duration-200 ${isExpanded ? "bg-gray-200 rotate-90" : ""}`}
                                  >
                                    <FiChevronRight
                                      size={14}
                                      className="text-gray-500"
                                    />
                                  </div>
                                  <FiFolder className="text-blue-500 mr-3" />
                                  <div className="flex-1">
                                    {editingClass === className ? (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center"
                                      >
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={(e) =>
                                            setEditValue(e.target.value)
                                          }
                                          onKeyDown={(e) =>
                                            handleKeyDown(e, className)
                                          }
                                          onClick={(e) => e.stopPropagation()}
                                          autoFocus
                                          className="text-md font-medium border border-primary-500 rounded px-2 py-0.5 focus:outline-none w-full max-w-[200px]"
                                          onBlur={(e) =>
                                            handleSaveEdit(e, className)
                                          }
                                        />
                                      </div>
                                    ) : (
                                      <div className="group flex items-center">
                                        <span className="font-medium text-gray-700 block mr-2">
                                          {className}
                                        </span>
                                        <button
                                          onClick={(e) =>
                                            handleStartEdit(e, className)
                                          }
                                          className="text-gray-400 hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                          title="Rename class"
                                        >
                                          <FiEdit2 size={12} />
                                        </button>
                                      </div>
                                    )}
                                    <span className="text-xs text-gray-400 block">
                                      {(stats.size / 1024).toFixed(1)} KB
                                    </span>
                                  </div>
                                </div>
                                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                                  {stats.count} files
                                </span>
                              </div>

                              {isExpanded && (
                                <div className="bg-gray-50 px-4 py-2 border-t border-gray-100 pl-12">
                                  <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-semibold">
                                    Sample Files
                                  </p>
                                  <ul className="space-y-2">
                                    {stats.samples.map((file, idx) => (
                                      <li
                                        key={idx}
                                        className="text-xs text-gray-600 flex items-center bg-white p-2 rounded border border-gray-100"
                                      >
                                        <FilePreview file={file} />
                                        <span className="truncate">
                                          {file.name}
                                        </span>
                                      </li>
                                    ))}
                                    {stats.count > 5 && (
                                      <li className="text-xs text-gray-400 italic pl-5">
                                        + {stats.count - 5} more files...
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}

              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  File List (First 5)
                </h3>
                <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                  {files.slice(0, 5).map((f, i) => (
                    <li
                      key={i}
                      className="px-4 py-2 text-sm text-gray-600 truncate"
                    >
                      {f.webkitRelativePath || f.name}
                    </li>
                  ))}
                  {files.length > 5 && (
                    <li className="px-4 py-2 text-sm text-gray-400 italic">
                      ...and {files.length - 5} more
                    </li>
                  )}
                </ul>
              </div>
            </section>
          )}

          {/* Step 5: Overview */}
          {currentStep === 5 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Review & Upload
              </h2>

              <div className="space-y-4">
                <div className="flex border-b border-gray-100 pb-4">
                  <div className="w-1/3 text-gray-500 text-sm">Name</div>
                  <div className="w-2/3 font-medium text-gray-900">
                    {formData.name}
                  </div>
                </div>
                <div className="flex border-b border-gray-100 pb-4">
                  <div className="w-1/3 text-gray-500 text-sm">Type</div>
                  <div className="w-2/3 font-medium text-gray-900 flex items-center">
                    {(() => {
                      const t = getSelectedType();
                      const Icon = t?.icon || FiFile;
                      return (
                        <>
                          <Icon className="mr-2" /> {t?.title}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex border-b border-gray-100 pb-4">
                  <div className="w-1/3 text-gray-500 text-sm">Description</div>
                  <div className="w-2/3 text-gray-900">
                    {formData.description || "-"}
                  </div>
                </div>
                <div className="flex border-b border-gray-100 pb-4">
                  <div className="w-1/3 text-gray-500 text-sm">Files</div>
                  <div className="w-2/3 font-medium text-gray-900">
                    {files.length}
                  </div>
                </div>
                <div className="flex pb-4">
                  <div className="w-1/3 text-gray-500 text-sm">Total Size</div>
                  <div className="w-2/3 font-medium text-gray-900">
                    {(previewData.totalSize / (1024 * 1024)).toFixed(2)} MB
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-5 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={currentStep === 1 ? () => navigate(-1) : handleBack}
              icon={<FiChevronLeft />}
            >
              {currentStep === 1 ? "Cancel" : "Back"}
            </Button>

            {currentStep < 5 ? (
              <Button onClick={handleNext} disabled={isNextDisabled()}>
                <span className="flex items-center">
                  Next <FiChevronRight className="ml-2" />
                </span>
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Uploading..." : "Create Dataset"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default NewDatasetPage;
