import React, { useState } from "react";
import PruningSubTab from "./PruningSubTab";
import QuantizationSubTab from "./QuantizationSubTab";
import { FiScissors, FiCpu } from "react-icons/fi";

const NetworkOptimizationTab = ({ workspace, isReadonly = false }) => {
  const [activeSubTab, setActiveSubTab] = useState("pruning");

  return (
    <div className="space-y-6">
      {/* Sub-tab selector */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveSubTab("pruning")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors
              ${
                activeSubTab === "pruning"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiScissors className="mr-2" /> Pruning
          </button>
          <button
            onClick={() => setActiveSubTab("quantization")}
            className={`
              pb-4 px-1 border-b-2 font-medium text-sm flex items-center transition-colors
              ${
                activeSubTab === "quantization"
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }
            `}
          >
            <FiCpu className="mr-2" /> Quantization
          </button>
        </nav>
      </div>

      {/* Sub-tab content */}
      <div className="animate-fade-in">
        {activeSubTab === "pruning" && (
          <PruningSubTab workspace={workspace} isReadonly={isReadonly} />
        )}
        {activeSubTab === "quantization" && (
          <QuantizationSubTab workspace={workspace} isReadonly={isReadonly} />
        )}
      </div>
    </div>
  );
};

export default NetworkOptimizationTab;
