import React, { useState, useEffect } from "react";
import { Stepper, Button, Card, Input } from "../common";
import { useAuth } from "../../context/AuthContext";
import {
  FiPlay,
  FiCpu,
  FiDatabase,
  FiLayers,
  FiSettings,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiActivity,
  FiArrowLeft,
  FiArrowRight,
  FiTerminal,
} from "react-icons/fi";

const EXECUTION_STEPS = [
  { id: 1, title: "Select Model" },
  { id: 2, title: "Select Dataset" },
  { id: 3, title: "Preprocessing" },
  { id: 4, title: "Configuration" },
  { id: 5, title: "Review & Run" },
];

const ExecutionTab = ({ workspace }) => {
  const { token } = useAuth();
  const [view, setView] = useState("list"); // "list" | "create"
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);

  // Wizard State
  const [activeStep, setActiveStep] = useState(1);
  const [selectedModel, setSelectedModel] = useState(null);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedPreprocessing, setSelectedPreprocessing] = useState(null);
  const [config, setConfig] = useState({
    batch_size: 32,
    epochs: 10,
    learning_rate: 0.001,
    device: "cpu",
  });

  // Data for selections
  const [models, setModels] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [preprocessings, setPreprocessings] = useState([]);

  useEffect(() => {
    fetchExecutions();
  }, [workspace.id]);

  const fetchExecutions = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) setExecutions(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (type) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/${type}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const handleStartWizard = async () => {
    setView("create");
    setActiveStep(1);
    setSelectedModel(null);
    setSelectedDataset(null);
    setSelectedPreprocessing(null);

    // Predownload data potentially needed (or load lazily in steps)
    const [m, d, p] = await Promise.all([
      fetchData("models"),
      fetchData("datasets"),
      fetchData("preprocessing"),
    ]);
    setModels(m);
    setDatasets(d);
    setPreprocessings(p);
  };

  const handleRunExecution = async () => {
    try {
      const payload = {
        model_id: selectedModel._id,
        dataset_id: selectedDataset._id,
        preprocessing_id: selectedPreprocessing?._id,
        config: config,
      };

      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions`,
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
        setView("list");
        fetchExecutions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 1:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <div
                key={model._id}
                onClick={() => setSelectedModel(model)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedModel?._id === model._id
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-100 rounded text-blue-600">
                    <FiCpu />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{model.name}</h4>
                    <span className="text-xs text-gray-500">
                      {model.format}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {model.description}
                </p>
              </div>
            ))}
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datasets.map((dataset) => (
              <div
                key={dataset._id}
                onClick={() => setSelectedDataset(dataset)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedDataset?._id === dataset._id
                    ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500"
                    : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-purple-100 rounded text-purple-600">
                    <FiDatabase />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {dataset.name}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {dataset.type}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">
                  {dataset.description}
                </p>
              </div>
            ))}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
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
                <h4 className="font-medium text-gray-900">None (Raw Data)</h4>
                <p className="text-sm text-gray-500">
                  Use dataset without additional preprocessing
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
        );
      case 4:
        return (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center mb-6 pb-4 border-b border-gray-100">
                <div className="p-2 bg-gray-100 rounded-lg text-gray-600 mr-3">
                  <FiSettings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Configuration
                  </h3>
                  <p className="text-sm text-gray-500">
                    Configure parameters for the model execution.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Batch Size */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Size
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <input
                      type="number"
                      min="1"
                      value={config.batch_size}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          batch_size: parseInt(e.target.value),
                        })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Number of samples processed in one pass.
                  </p>
                </div>

                {/* Epochs */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Epochs
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <input
                      type="number"
                      min="1"
                      value={config.epochs}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          epochs: parseInt(e.target.value),
                        })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Number of complete passes through the dataset.
                  </p>
                </div>

                {/* Learning Rate */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Learning Rate
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={config.learning_rate}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          learning_rate: parseFloat(e.target.value),
                        })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Step size at each iteration (for training).
                  </p>
                </div>

                {/* Device */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Compute Device
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <select
                      value={config.device}
                      onChange={(e) =>
                        setConfig({ ...config, device: e.target.value })
                      }
                      className="block w-full rounded-md border-gray-300 pl-3 focus:border-primary-500 focus:ring-primary-500 sm:text-sm py-2"
                    >
                      <option value="cpu">CPU</option>
                      <option value="cuda">CUDA (GPU)</option>
                      <option value="mps">MPS (Mac)</option>
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Hardware accelerator for the execution.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100 flex items-start">
              <FiAlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
              <p>
                Running on <b>{config.device.toUpperCase()}</b>. Ensure your
                backend worker supports this device type. Using GPU
                significantly accelerates inference time for large datasets.
              </p>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Execution Summary
            </h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Model</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedModel?.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Dataset</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedDataset?.name}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Preprocessing
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {selectedPreprocessing?.name || "None"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Configuration
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <ul className="list-disc pl-5">
                    {Object.entries(config).map(([k, v]) => (
                      <li key={k}>
                        {k}: {v}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        );
      default:
        return null;
    }
  };

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
          <h2 className="text-xl font-bold text-gray-900">New Execution</h2>
        </div>

        <Stepper steps={EXECUTION_STEPS} currentStep={activeStep} />

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
              disabled={
                (activeStep === 1 && !selectedModel) ||
                (activeStep === 2 && !selectedDataset)
              }
            >
              Next <FiArrowRight className="ml-2 inline" />
            </Button>
          ) : (
            <Button onClick={handleRunExecution} variant="primary">
              Run Execution <FiPlay className="ml-2 inline" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Executions</h2>
          <p className="text-sm text-gray-500">
            Manage and monitor your model inference runs
          </p>
        </div>
        <Button onClick={handleStartWizard} className="flex items-center">
          <FiPlay className="mr-2" /> New Execution
        </Button>
      </div>

      {executions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 border-dashed">
          <FiTerminal className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">
            No executions yet
          </h3>
          <p className="text-gray-500 mb-6">
            Start a new execution to run inference with your models.
          </p>
          <Button onClick={handleStartWizard}>Start Execution</Button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
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
              {executions.map((exec) => (
                <tr key={exec.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${
                        exec.status === "completed"
                          ? "bg-green-100 text-green-800"
                          : exec.status === "running"
                            ? "bg-blue-100 text-blue-800"
                            : exec.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {exec.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {exec.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(exec.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-primary-600 hover:text-primary-900">
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExecutionTab;
