import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { AlertProvider } from "./context/AlertContext";
import RegisterPage from "./pages/RegisterPage";
import LoginPage from "./pages/LoginPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import NewWorkspacePage from "./pages/NewWorkspacePage";
import WorkspaceDetailPage from "./pages/WorkspaceDetailPage";
import NewModelPage from "./pages/NewModelPage";
import NewDatasetPage from "./pages/NewDatasetPage";
import Model3DPage from "./pages/Model3DPage";
import ProfilePage from "./pages/ProfilePage";

// Component to handle home route logic
const HomeRouter = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );

  return isAuthenticated ? <DashboardPage /> : <LandingPage />;
};

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Guest Only Route Wrapper
const GuestOnlyRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return !isAuthenticated ? children : <Navigate to="/" replace />;
};

function App() {
  return (
    <Router>
      <AlertProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<HomeRouter />} />
              <Route
                path="/register"
                element={
                  <GuestOnlyRoute>
                    <RegisterPage />
                  </GuestOnlyRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <GuestOnlyRoute>
                    <LoginPage />
                  </GuestOnlyRoute>
                }
              />
              <Route
                path="/workspaces/new"
                element={
                  <ProtectedRoute>
                    <NewWorkspacePage />
                  </ProtectedRoute>
                }
              />{" "}
              <Route
                path="/workspaces/:id"
                element={
                  <ProtectedRoute>
                    <WorkspaceDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspaces/:id/models/new"
                element={
                  <ProtectedRoute>
                    <NewModelPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspaces/:id/datasets/new"
                element={
                  <ProtectedRoute>
                    <NewDatasetPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspaces/:id/models/:modelId/3d"
                element={
                  <ProtectedRoute>
                    <Model3DPage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </AlertProvider>
    </Router>
  );
}

export default App;
