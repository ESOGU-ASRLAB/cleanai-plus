import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  FiArrowLeft,
  FiTrendingUp,
  FiTrendingDown,
  FiMinus,
  FiInfo,
  FiCheckCircle,
  FiAlertTriangle,
} from "react-icons/fi";

const ExecutionCompare = ({ workspace, execution1Id, execution2Id, models = [], datasets = [], preprocessings = [], onClose }) => {
  const { token } = useAuth();
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadComparison();
  }, [execution1Id, execution2Id]);

  const loadComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://localhost:8000/api/workspaces/${workspace.id}/executions/compare?execution1_id=${execution1Id}&execution2_id=${execution2Id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setComparison(await res.json());
      } else {
        setError("Failed to load comparison data.");
      }
    } catch (err) {
      setError("Network error.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getMetricDisplayName = (metricName) => {
    const names = {
      accuracy: "Accuracy",
      top5_accuracy: "Top-5 Accuracy",
      loss: "Loss",
      precision: "Precision",
      recall: "Recall",
      f1_score: "F1 Score",
      time_per_sample_ms: "Time / Sample (ms)",
      energy_per_sample_j: "Energy / Sample (J)",
      gflops_per_joule: "GFLOPs / Joule",
      emissions: "CO2 Emissions (g)",
      emissions_per_min: "Emissions / Min (g)",
    };
    return names[metricName] || metricName;
  };

  const getTrendIcon = (improved) => {
    if (improved === null || improved === undefined)
      return <FiMinus className="text-gray-400" />;
    return improved ? (
      <FiTrendingUp className="text-green-500" />
    ) : (
      <FiTrendingDown className="text-red-500" />
    );
  };

  const getTrendColor = (improved) => {
    if (improved === null || improved === undefined) return "text-gray-600";
    return improved ? "text-green-600" : "text-red-600";
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleString();

  const findName = (list, id) => {
    if (!id) return null;
    const item = list.find((x) => x.id === id || x._id === id);
    return item?.name || item?.title || null;
  };

  const getExecMeta = (exec) => ({
    model: findName(models, exec.model_id),
    dataset: findName(datasets, exec.dataset_id),
    preprocessing: exec.preprocessing_id ? findName(preprocessings, exec.preprocessing_id) : null,
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          <p className="ml-4 text-gray-600">Loading comparison...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-gray-700 mb-4">{error}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!comparison) return null;

  const chartData = comparison.metric_comparisons
    .filter((m) => m.difference !== null)
    .map((m) => ({
      metric: getMetricDisplayName(m.metric_name),
      "Execution 1": m.execution1_value,
      "Execution 2": m.execution2_value,
      improved: m.improved,
    }));

  const performanceMetrics = chartData.filter((m) =>
    ["Accuracy", "Top-5 Accuracy", "Precision", "Recall", "F1 Score"].includes(m.metric)
  );

  const efficiencyMetrics = chartData.filter((m) =>
    ["Loss", "Time / Sample (ms)", "Energy / Sample (J)", "CO2 Emissions (g)", "Emissions / Min (g)"].includes(m.metric)
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center gap-3 p-5 border-b border-gray-200">
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <FiArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Execution Comparison</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Comparing metrics between two execution results
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-6 py-5 bg-gray-50 border-b border-gray-200 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiInfo className="text-blue-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Total Compared</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {comparison.summary.total_metrics_compared}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiCheckCircle className="text-green-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Improved</span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {comparison.summary.improved_metrics}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiAlertTriangle className="text-red-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Declined</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {comparison.summary.declined_metrics}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiMinus className="text-gray-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Unchanged</span>
            </div>
            <p className="text-2xl font-bold text-gray-600">
              {comparison.summary.unchanged_metrics}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-200">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
              Execution 1 - Baseline
            </p>
            <p className="text-sm text-blue-800 font-mono">
              {comparison.execution1.id.slice(0, 16)}...
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {formatDate(comparison.execution1.completed_at)}
            </p>
            {(() => {
              const meta = getExecMeta(comparison.execution1);
              return (
                <div className="mt-2 pt-2 border-t border-blue-200 space-y-0.5">
                  {meta.model && <p className="text-xs text-blue-700"><span className="font-medium">Model:</span> {meta.model}</p>}
                  {meta.dataset && <p className="text-xs text-blue-700"><span className="font-medium">Dataset:</span> {meta.dataset}</p>}
                  {meta.preprocessing && <p className="text-xs text-blue-700"><span className="font-medium">Preprocessing:</span> {meta.preprocessing}</p>}
                </div>
              );
            })()}
          </div>
          <div className="bg-emerald-50 rounded-lg px-4 py-3 border border-emerald-200">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
              Execution 2 - Comparison
            </p>
            <p className="text-sm text-emerald-800 font-mono">
              {comparison.execution2.id.slice(0, 16)}...
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {formatDate(comparison.execution2.completed_at)}
            </p>
            {(() => {
              const meta = getExecMeta(comparison.execution2);
              return (
                <div className="mt-2 pt-2 border-t border-emerald-200 space-y-0.5">
                  {meta.model && <p className="text-xs text-emerald-700"><span className="font-medium">Model:</span> {meta.model}</p>}
                  {meta.dataset && <p className="text-xs text-emerald-700"><span className="font-medium">Dataset:</span> {meta.dataset}</p>}
                  {meta.preprocessing && <p className="text-xs text-emerald-700"><span className="font-medium">Preprocessing:</span> {meta.preprocessing}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-8">
        {/* Performance chart */}
        {performanceMetrics.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Performance Metrics{" "}
              <span className="text-xs font-normal text-gray-500">(higher is better)</span>
            </h3>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={performanceMetrics} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Execution 1" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Execution 2" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Efficiency chart */}
        {efficiencyMetrics.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Efficiency Metrics{" "}
              <span className="text-xs font-normal text-gray-500">(lower is better)</span>
            </h3>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={efficiencyMetrics} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Execution 1" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Execution 2" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Detailed table */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-3">Detailed Comparison</h3>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                      Metric
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-blue-500 uppercase tracking-wider">
                      Execution 1
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-emerald-500 uppercase tracking-wider">
                      Execution 2
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Difference
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Change %
                    </th>
                    <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {comparison.metric_comparisons.map((metric, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">
                        {getMetricDisplayName(metric.metric_name)}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-blue-700 font-mono">
                        {metric.execution1_value !== null ? metric.execution1_value.toFixed(4) : "-"}
                      </td>
                      <td className="px-5 py-3 text-sm text-right text-emerald-700 font-mono">
                        {metric.execution2_value !== null ? metric.execution2_value.toFixed(4) : "-"}
                      </td>
                      <td className={`px-5 py-3 text-sm text-right font-mono font-semibold ${getTrendColor(metric.improved)}`}>
                        {metric.difference !== null
                          ? (metric.difference >= 0 ? "+" : "") + metric.difference.toFixed(4)
                          : "-"}
                      </td>
                      <td className={`px-5 py-3 text-sm text-right font-semibold ${getTrendColor(metric.improved)}`}>
                        {metric.percent_change !== null
                          ? (metric.percent_change >= 0 ? "+" : "") + metric.percent_change.toFixed(2) + "%"
                          : "-"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {getTrendIcon(metric.improved)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutionCompare;
