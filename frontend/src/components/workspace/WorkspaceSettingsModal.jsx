import React, { useState, useEffect } from "react";
import { FiX, FiAlertTriangle, FiLock, FiGlobe } from "react-icons/fi";
import { Button } from "../common";

const WorkspaceSettingsModal = ({
  isOpen,
  onClose,
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

  if (!isOpen || !workspace) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdate({ name, description, is_public: isPublic });
      onClose();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        {showDeleteConfirm ? (
          <div className="p-6 animate-fade-in">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <FiAlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-xl font-bold text-center text-gray-900 mb-2">
              Delete Workspace
            </h3>
            <p className="text-sm text-center text-gray-500 mb-6">
              Are you absolutely sure you want to delete{" "}
              <strong>{workspace.name}</strong>? This action cannot be undone
              and will delete all associated models, datasets, and executions.
            </p>
            <div className="flex justify-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium flex justify-center items-center"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete Workspace"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">
                Workspace Settings
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
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
                    rows="3"
                  />
                </div>

                <div className="mb-6">
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

                <div className="flex justify-end gap-3 mb-8">
                  <Button type="button" variant="secondary" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>

              <div className="border-t border-red-100 pt-6 mt-2">
                <h3 className="text-lg font-medium text-red-600 mb-2 flex items-center">
                  <FiAlertTriangle className="mr-2" /> Danger Zone
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Once you delete a workspace, there is no going back. Please be
                  certain.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="w-full py-2 px-4 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 hover:text-red-700 transition-colors font-medium flex justify-center items-center"
                >
                  Delete Workspace
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSettingsModal;
