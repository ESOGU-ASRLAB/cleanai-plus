import React, { useState } from "react";
import { FiScissors, FiMinimize2 } from "react-icons/fi";
import PruningSubTab from "./PruningSubTab";
import QuantizationSubTab from "./QuantizationSubTab";

const SUB_TABS = [
  { id: "pruning", label: "Pruning", icon: FiScissors, description: "Remove redundant channels to reduce model size and computation" },
  { id: "quantization", label: "Quantization", icon: FiMinimize2, description: "Reduce weight precision to compress model and accelerate inference" },
];

const NetworkOptimizationTab = ({ workspace, isReadonly = false }) => {
  const [activeSubTab, setActiveSubTab] = useState("pruning");

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Optimization methods">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`group flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-primary-600 text-primary-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-primary-600" : "text-gray-400 group-hover:text-gray-500"}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sub-tab content */}
      {activeSubTab === "pruning" && (
        <PruningSubTab workspace={workspace} isReadonly={isReadonly} />
      )}
      {activeSubTab === "quantization" && (
        <QuantizationSubTab workspace={workspace} isReadonly={isReadonly} />
      )}
    </div>
  );
};

export default NetworkOptimizationTab;
