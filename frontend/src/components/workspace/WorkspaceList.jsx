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
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
    e.preventDefault();
    const ws = workspaces.find((w) => w.id === id);
    setDeleteTarget({ id, name: ws?.name || "" });
    setDeleteConfirmText("");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/workspaces/${deleteTarget.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.ok) {
        setWorkspaces(workspaces.filter((w) => w.id !== deleteTarget.id));
        setDeleteTarget(null);
        setDeleteConfirmText("");
      }
    } catch (err) {
      console.error("Failed to delete", err);
    } finally {
      setIsDeleting(false);
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
      <div className="flex flex-col items-center justify-center text-center py-16 bg-white rounded-lg border-2 border-gray-200 border-dashed">
        <FiFolder className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">No workspaces yet</h3>
        <p className="text-gray-500 mb-6">
          Get started by creating your first workspace.
        </p>
        <Link to="/workspaces/new">
          <Button className="flex items-center">
            <FiPlus className="mr-2" /> Create Workspace
          </Button>
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Workspace</h3>
            <p className="text-gray-600 mb-4">
              This action <span className="font-semibold">cannot be undone</span>. All models, datasets, and executions associated with this workspace will be permanently deleted.
            </p>
            <p className="text-sm text-gray-700 mb-2">
              Please type <span className="font-semibold text-gray-900">{deleteTarget.name}</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={deleteTarget.name}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting || deleteConfirmText !== deleteTarget.name}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md transition-colors font-medium"
              >
                <FiTrash2 size={15} />
                {isDeleting ? "Deleting..." : "Delete Workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceList;
