import React, { useState, useEffect } from "react";
import { Card, Button } from "../common";
import { FiFolder, FiPlus, FiTrash2, FiClock } from "react-icons/fi";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const WorkspaceList = () => {
  const { token } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWorkspaces();
  }, [token]);

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/workspaces", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch workspaces");

      const data = await response.json();
      setWorkspaces(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.preventDefault(); // Prevent link click
    if (!confirm("Are you sure you want to delete this workspace?")) return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.ok) {
        setWorkspaces(workspaces.filter((w) => w.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 py-10 text-center">Error: {error}</div>;
  }

  if (workspaces.length === 0) {
    return (
      <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <div className="mx-auto h-24 w-24 text-gray-300 mb-4">
          <FiFolder className="w-full h-full" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">No workspaces yet</h3>
        <p className="mt-1 text-gray-500 mb-6">
          Get started by creating your first workspace.
        </p>
        <Link to="/workspaces/new">
          <Button icon={<FiPlus />}>Create Workspace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Create New Card */}
      <Link to="/workspaces/new" className="block group h-full">
        <div className="h-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-center p-6 text-gray-500 hover:border-primary-500 hover:text-primary-500 hover:bg-primary-50 transition-all cursor-pointer min-h-[200px]">
          <div className="mb-2 p-3 bg-gray-100 rounded-full group-hover:bg-primary-100 transition-colors">
            <FiPlus size={24} />
          </div>
          <span className="font-medium">Create New Workspace</span>
        </div>
      </Link>

      {/* Workspace Cards */}
      {workspaces.map((workspace) => (
        <Link
          key={workspace.id}
          to={`/workspaces/${workspace.id}`}
          className="block h-full"
        >
          <Card className="h-full hover:shadow-lg transition-shadow relative group flex flex-col justify-between min-h-[200px] border border-transparent hover:border-primary-100">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                  <FiFolder size={24} />
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDelete(workspace.id, e)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Delete workspace"
                  >
                    <FiTrash2 size={18} />
                  </button>
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 line-clamp-1">
                {workspace.name}
              </h3>
              <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                {workspace.description || "No description provided."}
              </p>
            </div>

            <div className="border-t border-gray-100 pt-4 mt-auto">
              <div className="flex items-center text-xs text-gray-400">
                <FiClock className="mr-1" />
                <span>
                  Updated {new Date(workspace.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
};

export default WorkspaceList;
