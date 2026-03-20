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

const EXEC_COLORS = [
  { bar: "#3B82F6", text: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",    label: "text-blue-600",   heading: "text-blue-800"   },
  { bar: "#10B981", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "text-emerald-600", heading: "text-emerald-800" },
  { bar: "#8B5CF6", text: "text-purple-700",  bg: "bg-purple-50",  border: "border-purple-200",  label: "text-purple-600",  heading: "text-purple-800"  },
  { bar: "#F59E0B", text: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   label: "text-amber-600",   heading: "text-amber-800"   },
];

const ExecutionCompare = ({ workspace, executionIds = [], models = [], datasets = [], preprocessings = [], onClose }) => {
  const { token } = useAuth();
  // comparisons[i] = compare result of executionIds[0] vs executionIds[i+1]
  const [comparisons, setComparisons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadComparisons();
  }, [executionIds.join("_")]);

  const loadComparisons = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        executionIds.slice(1).map((id) =>
          fetch(
            `http://localhost:8000/api/workspaces/${workspace.id}/executions/compare?execution1_id=${executionIds[0]}&execution2_id=${id}`,
            { headers: { Authorization: `Bearer ${token}` } },
          ).then((r) => (r.ok ? r.json() : Promise.reject()))
        ),
      );
      setComparisons(results);
    } catch {
      setError("Failed to load comparison data.");
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

  // Build flat list of all execution objects: [baseline, ...compared]
  const allExecs = comparisons.length > 0
    ? [comparisons[0].execution1, ...comparisons.map((c) => c.execution2)]
    : [];

  // Build unified metric rows
  const allMetricNames = comparisons.length > 0
    ? comparisons[0].metric_comparisons.map((m) => m.metric_name)
    : [];

  // metricValues[metricName][execIndex] = value
  const metricValues = {};
  allMetricNames.forEach((name) => {
    const baseline = comparisons[0]?.metric_comparisons.find((m) => m.metric_name === name);
    metricValues[name] = [
      baseline?.execution1_value ?? null,
      ...comparisons.map((c) => c.metric_comparisons.find((m) => m.metric_name === name)?.execution2_value ?? null),
    ];
  });

  // Aggregate summary totals (vs baseline)
  const totalImproved = comparisons.reduce((acc, c) => acc + (c.summary?.improved_metrics || 0), 0);
  const totalDeclined = comparisons.reduce((acc, c) => acc + (c.summary?.declined_metrics || 0), 0);
  const totalUnchanged = comparisons.reduce((acc, c) => acc + (c.summary?.unchanged_metrics || 0), 0);
  const totalMetrics = comparisons[0]?.summary?.total_metrics_compared || 0;

  const PERF_METRICS = ["Accuracy", "Top-5 Accuracy", "Precision", "Recall", "F1 Score"];
  const EFF_METRICS = ["Loss", "Time / Sample (ms)", "Energy / Sample (J)", "CO2 Emissions (g)", "Emissions / Min (g)"];

  const buildChartData = (filter) =>
    allMetricNames
      .filter((n) => filter.includes(getMetricDisplayName(n)))
      .map((n) => {
        const row = { metric: getMetricDisplayName(n) };
        (metricValues[n] || []).forEach((v, i) => {
          row[`Execution ${i + 1}`] = v;
        });
        return row;
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

  if (comparisons.length === 0) return null;

  const performanceChartData = buildChartData(PERF_METRICS);
  const efficiencyChartData = buildChartData(EFF_METRICS);

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
            Comparing {allExecs.length} executions — Execution 1 is the baseline
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-6 py-5 bg-gray-50 border-b border-gray-200 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiInfo className="text-blue-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Total Metrics</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{totalMetrics}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiCheckCircle className="text-green-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Improved</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{totalImproved}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiAlertTriangle className="text-red-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Declined</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{totalDeclined}</p>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <FiMinus className="text-gray-500" size={14} />
              <span className="text-xs font-medium text-gray-500">Unchanged</span>
            </div>
            <p className="text-2xl font-bold text-gray-600">{totalUnchanged}</p>
          </div>
        </div>

        {/* Execution cards */}
        <div className={`grid grid-cols-1 gap-4 ${
          allExecs.length === 2 ? "md:grid-cols-2" :
          allExecs.length === 3 ? "md:grid-cols-3" :
          "md:grid-cols-4"
        }`}>
          {allExecs.map((exec, i) => {
            const color = EXEC_COLORS[i];
            const meta = getExecMeta(exec);
            return (
              <div key={exec.id} className={`rounded-lg px-4 py-3 border ${color.bg} ${color.border}`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color.label}`}>
                  Execution {i + 1}{i === 0 ? " — Baseline" : ""}
                </p>
                <p className={`text-xs mt-0.5 ${color.label}`}>
                  {formatDate(exec.completed_at)}
                </p>
                <div className={`mt-2 pt-2 border-t ${color.border} space-y-0.5`}>
                  {meta.model && <p className={`text-xs ${color.heading}`}><span className="font-medium">Model:</span> {meta.model}</p>}
                  {meta.dataset && <p className={`text-xs ${color.heading}`}><span className="font-medium">Dataset:</span> {meta.dataset}</p>}
                  {meta.preprocessing && <p className={`text-xs ${color.heading}`}><span className="font-medium">Preprocessing:</span> {meta.preprocessing}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-8">
        {/* Performance chart */}
        {performanceChartData.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Performance Metrics{" "}
              <span className="text-xs font-normal text-gray-500">(higher is better)</span>
            </h3>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={performanceChartData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {allExecs.map((_, i) => (
                    <Bar key={i} dataKey={`Execution ${i + 1}`} fill={EXEC_COLORS[i].bar} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Efficiency chart */}
        {efficiencyChartData.length > 0 && (
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Efficiency Metrics{" "}
              <span className="text-xs font-normal text-gray-500">(lower is better)</span>
            </h3>
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={efficiencyChartData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {allExecs.map((_, i) => (
                    <Bar key={i} dataKey={`Execution ${i + 1}`} fill={EXEC_COLORS[i].bar} radius={[4, 4, 0, 0]} />
                  ))}
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
                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                      Metric
                    </th>
                    {allExecs.map((_, i) => (
                      <th
                        key={i}
                        className={`px-5 py-3 text-right text-xs font-medium uppercase tracking-wider ${EXEC_COLORS[i].label}`}
                      >
                        Exec {i + 1}{i === 0 ? " (Base)" : ""}
                      </th>
                    ))}
                    {/* vs baseline diff columns — only when >2 execs, show per-exec diff; for 2 execs show classic diff+% */}
                    {allExecs.length === 2 && (
                      <>
                        <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Diff
                        </th>
                        <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Change %
                        </th>
                        <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Trend
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {allMetricNames.map((name, idx) => {
                    const values = metricValues[name] || [];
                    // For 2-exec: classic diff/trend from first comparison
                    const cmp0 = comparisons[0]?.metric_comparisons.find((m) => m.metric_name === name);
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">
                          {getMetricDisplayName(name)}
                        </td>
                        {values.map((v, i) => (
                          <td key={i} className={`px-5 py-3 text-sm text-right font-mono ${EXEC_COLORS[i].text}`}>
                            {v !== null ? Number(v).toFixed(4) : "-"}
                          </td>
                        ))}
                        {allExecs.length === 2 && (
                          <>
                            <td className={`px-5 py-3 text-sm text-right font-mono font-semibold ${getTrendColor(cmp0?.improved)}`}>
                              {cmp0?.difference !== null && cmp0?.difference !== undefined
                                ? (cmp0.difference >= 0 ? "+" : "") + cmp0.difference.toFixed(4)
                                : "-"}
                            </td>
                            <td className={`px-5 py-3 text-sm text-right font-semibold ${getTrendColor(cmp0?.improved)}`}>
                              {cmp0?.percent_change !== null && cmp0?.percent_change !== undefined
                                ? (cmp0.percent_change >= 0 ? "+" : "") + cmp0.percent_change.toFixed(2) + "%"
                                : "-"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {getTrendIcon(cmp0?.improved)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
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
