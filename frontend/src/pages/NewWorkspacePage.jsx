import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "../components/layout";
import { Card, Input, Button } from "../components/common";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { FiFolder } from "react-icons/fi";

const NewWorkspacePage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { error } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
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
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Create New Workspace
        </h1>

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
