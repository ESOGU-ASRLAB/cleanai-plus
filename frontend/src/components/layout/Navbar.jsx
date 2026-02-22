import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../common";
import { FiLogOut, FiUser } from "react-icons/fi";

const Navbar = () => {
  const { isAuthenticated, logout, token, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  let username = "";
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.sub) {
        username = payload.sub.split("@")[0];
      }
    } catch (e) {
      console.error("Failed to parse token", e);
    }
  }

  const avatarUrl = user?.avatar_url
    ? `http://localhost:8000${user.avatar_url}?t=${new Date().getTime()}`
    : null;

  return (
    <nav className="bg-white border-b border-gray-100 py-3 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-12">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-secondary-600 rounded-lg flex items-center justify-center shadow-md">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-700 to-secondary-700">
              CleanAI+
            </span>
          </Link>

          {/* Right Side */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <div className="flex items-center space-x-4">
                <Link
                  to="/profile"
                  className="text-gray-600 hover:text-primary-600 transition-colors flex items-center gap-2 font-medium"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <FiUser size={20} />
                  )}
                  <span>{username}</span>
                </Link>
                <div className="h-6 w-px bg-gray-200"></div>
                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-accent-600 transition-colors flex items-center text-sm font-medium"
                >
                  <FiLogOut className="mr-2" size={18} />
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <Link
                  to="/login"
                  className="text-gray-600 hover:text-primary-600 font-medium transition-colors"
                >
                  Sign in
                </Link>
                <Link to="/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
