import React, { useState } from "react";
import { MainLayout } from "../components/layout";
import WorkspaceList from "../components/workspace/WorkspaceList";
import { Button } from "../components/common";
import { FiPlus, FiAlertCircle, FiX } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showVerificationAlert, setShowVerificationAlert] = useState(true);

  const handleVerifyClick = async () => {
    try {
      // Send a new verification code
      await fetch("http://localhost:8000/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
        }),
      });

      // Redirect to profile page with verify tab/section open
      navigate("/profile?verify=true");
    } catch (error) {
      console.error("Failed to resend verification code:", error);
    }
  };

  return (
    <MainLayout>
      <div>
        {user && !user.is_verified && showVerificationAlert && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md shadow-sm flex items-start justify-between">
            <div className="flex items-start">
            <div className="flex-shrink-0">
              <FiAlertCircle
                className="h-5 w-5 text-yellow-400"
                aria-hidden="true"
              />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Your account is not verified yet
              </h3>
              <div className="mt-1 text-sm text-yellow-700">
                <p>
                  Please activate your account using the verification code sent
                  to your email address. Unverified accounts may have restricted
                  features.
                </p>
                <button
                  onClick={handleVerifyClick}
                  className="mt-2 text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
                >
                  Click here to verify your account
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="ml-auto bg-yellow-50 text-yellow-500 hover:text-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 rounded-md p-1.5"
            onClick={() => setShowVerificationAlert(false)}
          >
            <span className="sr-only">Close</span>
            <FiX className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}

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
