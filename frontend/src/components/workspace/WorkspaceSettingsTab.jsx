import React, { useState, useEffect } from "react";
import { FiAlertTriangle, FiLock, FiGlobe, FiSave, FiTrash2 } from "react-icons/fi";
import { Button } from "../common";

const WorkspaceSettingsTab = ({
  workspace,
  onUpdate,
  onDelete,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name || "");
      setDescription(workspace.description || "");
      setIsPublic(workspace.is_public || false);
      setShowDeleteConfirm(false);
    }
  }, [workspace]);

  if (!workspace) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdate({ name, description, is_public: isPublic });
    } catch (error) {
      console.error("Failed to update workspace", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error("Failed to delete workspace", error);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Workspace Settings</h2>
        <p className="text-sm text-gray-500">
          Manage your workspace details, visibility, and danger zone actions.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workspace Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows="4"
              />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Visibility
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Private Option */}
                <div
                  onClick={() => setIsPublic(false)}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    !isPublic
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div
                      className={`p-2 rounded-lg mr-3 ${
                        !isPublic
                          ? "bg-primary-100 text-primary-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <FiLock size={20} />
                    </div>
                    <h3
                      className={`font-semibold ${
                        !isPublic ? "text-primary-900" : "text-gray-900"
                      }`}
                    >
                      Private
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">
                    Only you can see and access this workspace.
                  </p>
                </div>

                {/* Public Option */}
                <div
                  onClick={() => setIsPublic(true)}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    isPublic
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div
                      className={`p-2 rounded-lg mr-3 ${
                        isPublic
                          ? "bg-primary-100 text-primary-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <FiGlobe size={20} />
                    </div>
                    <h3
                      className={`font-semibold ${
                        isPublic ? "text-primary-900" : "text-gray-900"
                      }`}
                    >
                      Public
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">
                    Anyone on the internet can see this workspace.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting} className="flex items-center">
                <FiSave className="mr-2" />
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 rounded-lg border border-red-200 overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-medium text-red-800 mb-2 flex items-center">
            <FiAlertTriangle className="mr-2" /> Danger Zone
          </h3>
          <p className="text-sm text-red-600 mb-6">
            Once you delete a workspace, there is no going back. This action will permanently delete all associated models, datasets, and executions. Please be certain.
          </p>
          
          {showDeleteConfirm ? (
            <div className="bg-white p-4 rounded-md border border-red-200 animate-fade-in">
              <p className="text-sm font-medium text-gray-900 mb-4">
                Are you absolutely sure you want to delete <strong>{workspace.name}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium flex items-center"
                >
                  <FiTrash2 className="mr-2" />
                  {isDeleting ? "Deleting..." : "Yes, Delete Workspace"}
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="py-2 px-4 bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors font-medium flex items-center"
            >
              <FiTrash2 className="mr-2" />
              Delete Workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceSettingsTab;
