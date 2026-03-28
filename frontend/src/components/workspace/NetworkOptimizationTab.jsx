import React from "react";
import PruningSubTab from "./PruningSubTab";

const NetworkOptimizationTab = ({ workspace, isReadonly = false }) => {
  return (
    <div className="space-y-6">
      <PruningSubTab workspace={workspace} isReadonly={isReadonly} />
    </div>
  );
};

export default NetworkOptimizationTab;
