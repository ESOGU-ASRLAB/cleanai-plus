import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout";
import { Card, Input, Button } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { FiFolder, FiLock, FiGlobe } from "react-icons/fi";

const NewWorkspacePage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { error } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_public: false,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/workspaces/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error("Failed to create workspace");

      const data = await response.json();
      navigate("/"); // Go back to dashboard
    } catch (err) {
      error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Create New Workspace
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up a new environment for your models and datasets
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Workspace Name"
              placeholder="e.g., Image Classification Project"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              required
              icon={FiFolder}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description (Optional)
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-primary-500 focus:outline-none focus:ring-2 p-3 min-h-[100px]"
                placeholder="Describe your project goals..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Visibility
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Private Option */}
                <div
                  onClick={() => setFormData({ ...formData, is_public: false })}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    !formData.is_public
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div
                      className={`p-2 rounded-lg mr-3 ${
                        !formData.is_public
                          ? "bg-primary-100 text-primary-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <FiLock size={20} />
                    </div>
                    <h3
                      className={`font-semibold ${
                        !formData.is_public
                          ? "text-primary-900"
                          : "text-gray-900"
                      }`}
                    >
                      Private
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 ml-11">
                    Only you can see and access this workspace.
                  </p>
                </div>

                {/* Public Option */}
                <div
                  onClick={() => setFormData({ ...formData, is_public: true })}
                  className={`cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 ${
                    formData.is_public
                      ? "border-primary-500 bg-primary-50"
                      : "border-gray-200 hover:border-primary-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <div
                      className={`p-2 rounded-lg mr-3 ${
                        formData.is_public
                          ? "bg-primary-100 text-primary-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <FiGlobe size={20} />
                    </div>
                    <h3
                      className={`font-semibold ${
                        formData.is_public
                          ? "text-primary-900"
                          : "text-gray-900"
                      }`}
                    >
                      Public
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500 ml-11">
                    Anyone on the internet can see this workspace.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/")}
              >
                Cancel
              </Button>
              <Button type="submit" loading={loading} disabled={!formData.name}>
                Create Workspace
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </MainLayout>
  );
};

export default NewWorkspacePage;
