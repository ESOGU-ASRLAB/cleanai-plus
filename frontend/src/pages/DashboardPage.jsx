import React, { useState, useEffect } from "react";
import { MainLayout } from "../components/layout";
import WorkspaceList from "../components/workspace/WorkspaceList";
import { Button } from "../components/common";
import { FiPlus, FiAlertCircle, FiX } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTour } from "../context/TourContext";

const DASHBOARD_TOUR_STEPS = [
  {
    target: null,
    title: "Welcome to CleanAI Plus!",
    content:
      "Let's take a quick tour so you can get the most out of the platform. We'll walk through the key features in just a moment.",
    position: "center",
  },
  {
    target: "new-workspace-btn",
    title: "Create a Workspace",
    content:
      "A workspace is your isolated project environment. Click \"New Workspace\" to create one and start organizing your AI models and datasets.",
    position: "bottom",
  },
  {
    target: "workspace-list-section",
    title: "Your Workspaces",
    content:
      "All your workspaces appear here as cards. Click any workspace to open it and explore its models, datasets, execution runs, and optimization tools.",
    position: "top",
  },
];

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { startTour, endTour, registerTour } = useTour();
  const [showVerificationAlert, setShowVerificationAlert] = useState(true);

  // Register tour so navbar button can trigger it any time
  useEffect(() => {
    registerTour("dashboard", () => DASHBOARD_TOUR_STEPS);
  }, [registerTour]);

  // Start tour for users who haven't seen it yet
  useEffect(() => {
    if (!user) return;
    const userId = user._id ?? user.id;
    const tourKey = `tour_dashboard_done_${userId}`;
    if (!localStorage.getItem(tourKey)) {
      // Mark as done immediately so it only shows once per user
      localStorage.setItem(tourKey, "1");
      // Small delay to let the page fully render
      const t = setTimeout(() => startTour(DASHBOARD_TOUR_STEPS), 600);
      return () => clearTimeout(t);
    }
  }, [user, startTour]);

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
                    Please activate your account using the verification code
                    sent to your email address. Unverified accounts may have
                    restricted features.
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
          <Link to="/workspaces/new" data-tour="new-workspace-btn">
            <Button className="flex items-center">
              <FiPlus className="mr-2" /> New Workspace
            </Button>
          </Link>
        </div>

        <div data-tour="workspace-list-section">
          <WorkspaceList />
        </div>
      </div>
    </MainLayout>
  );
};

export default DashboardPage;
