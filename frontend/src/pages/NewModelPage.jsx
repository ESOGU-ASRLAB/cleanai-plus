import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout";
import {
  Button,
  Input,
  Stepper,
  WindowedCodeEditor,
} from "../components/common";
import {
  FiSave,
  FiUploadCloud,
  FiPackage,
  FiShield,
  FiCpu,
  FiLayers,
  FiCheck,
  FiChevronRight,
  FiChevronLeft,
  FiFileText,
  FiCode,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";

const MODEL_FORMATS = [
  {
    id: "state_dict",
    title: "State Dictionary (Recommended)",
    icon: FiLayers,
    description:
      "Save only the learnable parameters (weights & biases). Requires the model class definition code to load.",
    usage: "model.load_state_dict(torch.load(path))",
    color: "border-green-500 bg-green-50",
    needsDefinition: true,
  },
  {
    id: "safetensors",
    title: "Safetensors",
    icon: FiShield,
    description:
      "Safe, fast, and secure weight format. Does not use pickle, ensuring no code execution risks.",
    usage: "load_file(path) -> model.load_state_dict(sd)",
    color: "border-blue-500 bg-blue-50",
    needsDefinition: true,
  },
  {
    id: "torchscript",
    title: "TorchScript",
    icon: FiCpu,
    description:
      "Serialized model that can run independently of Python code. Best for production deployment.",
    usage: "torch.jit.load(path)",
    color: "border-purple-500 bg-purple-50",
    needsDefinition: false,
  },
  {
    id: "checkpoint",
    title: "Training Checkpoint",
    icon: FiSave,
    description:
      "Contains model weights, optimizer state, and epoch info. Used to resume training.",
    usage: "ckpt = torch.load(path) -> load weights & optimizer",
    color: "border-orange-500 bg-orange-50",
    needsDefinition: true,
  },
  {
    id: "full_model",
    title: "Full Model (Pickle)",
    icon: FiPackage,
    description:
      "Saves the entire model object using pickle. Easiest to load but risky and brittle.",
    usage: "model = torch.load(path)",
    color: "border-gray-500 bg-gray-50",
    needsDefinition: false,
  },
];

const NewModelPage = () => {
  const { id: workspaceId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    format: "state_dict",
  });
  const [file, setFile] = useState(null);
  const [definitionFile, setDefinitionFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Definition step state
  const [defMethod, setDefMethod] = useState("file"); // 'file' or 'editor'
  const [fileName, setFileName] = useState("model");
  const [editorCode, setEditorCode] = useState(
    "# Define your PyTorch model here\nimport torch\nimport torch.nn as nn\n\nclass MyModel(nn.Module):\n    def __init__(self):\n        super().__init__()\n        # ...\n\n    def forward(self, x):\n        pass\n",
  );
  const wsRef = useRef(null);
  const monacoRef = useRef(null);

  const steps = [
    { id: 1, title: "Basic Info" },
    { id: 2, title: "Loading Strategy" },
    { id: 3, title: "Upload Model" },
    { id: 4, title: "Model Definition" },
    { id: 5, title: "Overview" },
  ];

  const getSelectedFormat = () =>
    MODEL_FORMATS.find((f) => f.id === formData.format);

  const handleDefinitionFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setDefinitionFile(file);

      // Update editor content and filename
      const reader = new FileReader();
      reader.onload = (event) => {
        setEditorCode(event.target.result);
      };
      reader.readAsText(file);

      const name = file.name.replace(/\.py$/i, "");
      setFileName(name);
    }
  };

  const handleNext = () => {
    // Step 1: Validation
    if (currentStep === 1 && !formData.name) {
      alert("Please enter a model name.");
      return;
    }
    // Step 3: File validation
    if (currentStep === 3 && !file) {
      alert("Please select a model file.");
      return;
    }

    // Skip Step 4 if not needed
    if (currentStep === 3) {
      const format = getSelectedFormat();
      if (!format.needsDefinition) {
        setCurrentStep(5);
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    // Skip Step 4 backwards if not needed
    if (currentStep === 5) {
      const format = getSelectedFormat();
      if (!format.needsDefinition) {
        setCurrentStep(3);
        return;
      }
    }
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const isNextDisabled = () => {
    if (currentStep === 1 && !formData.name) return true;
    if (currentStep === 3 && !file) return true;
    // Step 4 is optional even if requested? Usually definition is needed if requested,
    // but maybe user wants to upload later. For strictness, let's keep it optional
    // or validate if strict. User said "Upload Model Definition adımı olsun", we'll make it optional but recommended.
    return false;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append("name", formData.name);
      formDataToSend.append("description", formData.description);
      formDataToSend.append("format", formData.format);
      formDataToSend.append("file", file);

      // Determine definition file based on user selection method
      let finalDefinitionFile = definitionFile;

      if (defMethod === "editor") {
        if (editorCode && editorCode.trim().length > 0) {
          const blob = new Blob([editorCode], { type: "text/x-python" });
          const name = fileName.endsWith(".py") ? fileName : `${fileName}.py`;
          finalDefinitionFile = new File([blob], name, {
            type: "text/x-python",
          });
        } else {
          // If editor mode but empty, send nothing
          finalDefinitionFile = null;
        }
      } else {
        // 'file' mode
        // already assigned definitionFile to finalDefinitionFile
        // but if they didn't select one, it remains null
      }

      if (finalDefinitionFile) {
        formDataToSend.append("definition_file", finalDefinitionFile);
      }

      const response = await fetch(
        `http://localhost:8000/api/workspaces/${workspaceId}/models/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataToSend,
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to upload model");
      }

      navigate(`/workspaces/${workspaceId}`);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Register New Model
          </h1>
          <p className="text-gray-500">
            Upload your PyTorch model artifacts to this workspace.
          </p>
        </div>

        {/* Stepper Header */}
        <Stepper steps={steps} currentStep={currentStep} />

        <form
          onSubmit={(e) => e.preventDefault()}
          className="space-y-8 min-h-[400px]"
        >
          {/* Step 1: Basic Information */}
          {currentStep === 1 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Model Details
              </h2>
              <div className="space-y-4">
                <Input
                  label="Model Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. ResNet50-FineTuned"
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
                    placeholder="Describe your model architecture, training data source, and performance metrics..."
                  />
                </div>
              </div>
            </section>
          )}

          {/* Step 2: Loading Strategy */}
          {currentStep === 2 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Format
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {MODEL_FORMATS.map((fmt) => {
                  const Icon = fmt.icon;
                  const isSelected = formData.format === fmt.id;
                  return (
                    <div
                      key={fmt.id}
                      onClick={() =>
                        setFormData({ ...formData, format: fmt.id })
                      }
                      className={`
                        relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none transition-all
                        ${isSelected ? `${fmt.color} ring-2 ring-offset-2 ring-primary-500` : "border-gray-300 bg-white hover:bg-gray-50"}
                      `}
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
                              {fmt.title}
                            </span>
                            <span className="block text-sm text-gray-500 mt-1">
                              {fmt.description}
                            </span>
                            <code className="block text-xs bg-gray-800 text-gray-200 mt-2 p-1 rounded px-2 font-mono w-fit">
                              {fmt.usage}
                            </code>
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

          {/* Step 3: Upload Model */}
          {currentStep === 3 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Upload Model File
              </h2>
              <div className="mt-1 flex justify-center px-6 pt-10 pb-10 border-2 border-gray-300 border-dashed rounded-md hover:border-primary-500 transition-colors bg-gray-50">
                <div className="space-y-1 text-center">
                  <FiUploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600 justify-center">
                    <label
                      htmlFor="model-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500 px-2"
                    >
                      <span>Select model weights</span>
                      <input
                        id="model-upload"
                        name="model-upload"
                        type="file"
                        className="sr-only"
                        onChange={(e) => setFile(e.target.files[0])}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-gray-500">
                    Weights file (.pt, .pth, .safetensors, .ckpt)
                  </p>
                  {file && (
                    <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-md text-sm font-medium flex items-center justify-center border border-green-200">
                      <FiPackage className="mr-2" />
                      {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Step 4: Model Definition (Conditional) */}
          {currentStep === 4 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Model Definition
              </h2>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md flex items-start mb-6">
                <FiCode className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">
                    Architecture Definition Recommended
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    For <b>{formData.format}</b>, the system needs the Python
                    class definition to load the weights.
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    type="button"
                    onClick={() => setDefMethod("file")}
                    className={`
                      pb-4 px-1 border-b-2 font-medium text-sm flex items-center
                      ${
                        defMethod === "file"
                          ? "border-primary-500 text-primary-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }
                    `}
                  >
                    <FiUploadCloud className="mr-2" /> Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefMethod("editor")}
                    className={`
                      pb-4 px-1 border-b-2 font-medium text-sm flex items-center
                      ${
                        defMethod === "editor"
                          ? "border-primary-500 text-primary-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }
                    `}
                  >
                    <FiCode className="mr-2" /> Write Code
                  </button>
                </nav>
              </div>

              {defMethod === "file" ? (
                <div className="mt-1 flex justify-center px-6 pt-10 pb-10 border-2 border-gray-300 border-dashed rounded-md hover:border-primary-500 transition-colors bg-gray-50">
                  <div className="space-y-1 text-center">
                    <FiFileText className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 justify-center">
                      <label
                        htmlFor="def-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500 px-2"
                      >
                        <span>Select definition file (.py)</span>
                        <input
                          id="def-upload"
                          name="def-upload"
                          type="file"
                          accept=".py"
                          className="sr-only"
                          onChange={handleDefinitionFileChange}
                        />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">Python source file</p>
                    {definitionFile && (
                      <div className="mt-4 p-3 bg-blue-100 text-blue-800 rounded-md text-sm font-medium flex items-center justify-center border border-blue-200">
                        <FiCode className="mr-2" />
                        {definitionFile.name} (
                        {(definitionFile.size / 1024).toFixed(2)} KB)
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <WindowedCodeEditor
                  fileName={fileName}
                  onFileNameChange={setFileName}
                  value={editorCode}
                  onChange={(value) => setEditorCode(value || "")}
                  height="400px"
                />
              )}
            </section>
          )}

          {/* Step 5: Overview */}
          {currentStep === 5 && (
            <section className="bg-white p-6 rounded-lg border border-gray-200 animate-fade-in-up">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Review & Create
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    General Info
                  </h3>
                  <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
                    <p className="font-semibold text-gray-900">
                      {formData.name}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {formData.description || "No description"}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Format Strategy
                  </h3>
                  <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 flex items-center">
                    {(() => {
                      const fmt = getSelectedFormat();
                      const Icon = fmt.icon;
                      return <Icon className="mr-2 text-gray-500" />;
                    })()}
                    <span className="font-medium text-gray-900">
                      {getSelectedFormat()?.title}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Model Artifact
                  </h3>
                  <div className="mt-2 p-3 bg-green-50 rounded border border-green-200 flex items-center">
                    <FiPackage className="mr-2 text-green-700" />
                    <span className="text-green-800 font-medium">
                      {file.name}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500">
                    Definition File
                  </h3>
                  {defMethod === "editor" && editorCode ? (
                    <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-200 flex items-center">
                      <FiCode className="mr-2 text-blue-700" />
                      <span className="text-blue-800 font-medium">
                        {fileName.endsWith(".py")
                          ? fileName
                          : `${fileName}.py`}{" "}
                        (From Editor)
                      </span>
                    </div>
                  ) : definitionFile ? (
                    <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-200 flex items-center">
                      <FiCode className="mr-2 text-blue-700" />
                      <span className="text-blue-800 font-medium">
                        {definitionFile.name}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200 text-gray-400 italic">
                      Not provided / Not required
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-5 border-t border-gray-200">
            {currentStep > 1 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={handleBack}
                icon={<FiChevronLeft />}
              >
                Back
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
            )}

            {currentStep < 5 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={isNextDisabled()}
              >
                <span className="flex items-center">
                  Next <FiChevronRight className="ml-2" />
                </span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!file || loading}
              >
                {loading ? "Uploading..." : "Create Model"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </MainLayout>
  );
};

export default NewModelPage;
