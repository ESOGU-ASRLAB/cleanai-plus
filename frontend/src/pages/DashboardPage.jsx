import React from "react";
import { MainLayout } from "../components/layout";
import WorkspaceList from "../components/workspace/WorkspaceList";
import { Button } from "../components/common";
import { FiPlus } from "react-icons/fi";
import { Link } from "react-router-dom";

const DashboardPage = () => {
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Workspaces</h1>
          <p className="text-gray-500 mt-1">
            Manage your models and experiments
          </p>
        </div>
        <Link to="/workspaces/new">
          <Button className="flex items-center">
            <FiPlus className="mr-2" /> New Workspace
          </Button>
        </Link>
      </div>

      <WorkspaceList />
    </MainLayout>
  );
};

export default DashboardPage;
