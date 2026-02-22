import React from "react";
import { FiFolder, FiTerminal, FiCloud } from "react-icons/fi";
import { Card } from "../common";

const StatCard = ({ title, value, icon, color }) => {
  return (
    <Card className="flex items-center p-6 w-full md:w-1/3">
      <div className={`p-4 rounded-full ${color} text-white shadow-lg mr-4`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          {title}
        </p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
    </Card>
  );
};

const StatsCards = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="flex flex-col md:flex-row gap-6 mb-8 w-full">
      <StatCard
        title="Total Workspaces"
        value={stats.workspaces_count || 0}
        icon={<FiFolder className="w-6 h-6" />}
        color="bg-indigo-600"
      />
      <StatCard
        title="Completed Executions"
        value={stats.models_trained || 0}
        icon={<FiTerminal className="w-6 h-6" />}
        color="bg-blue-600"
      />
      <StatCard
        title="CO2 Emissions (kg)"
        value={Number(stats.co2_saved || 0).toFixed(2)}
        icon={<FiCloud className="w-6 h-6" />}
        color="bg-green-600"
      />
    </div>
  );
};

export default StatsCards;
