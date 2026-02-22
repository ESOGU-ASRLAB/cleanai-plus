import React, { useRef, useState } from "react";
import {
  FiUser,
  FiCheckCircle,
  FiClock,
  FiCamera,
  FiTrash2,
} from "react-icons/fi";
import { Card } from "../common";
import userService from "../../services/userService";
import { useAlert } from "../../context/AlertContext";

const ProfileHeader = ({ user, refreshUser }) => {
  const fileInputRef = useRef(null);
  const { showAlert } = useAlert();
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteAvatarClick = (e) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDeleteAvatar = async () => {
    try {
      setUploading(true);
      await userService.deleteAvatar();
      if (refreshUser) refreshUser();
    } catch (error) {
      console.error("Failed to delete avatar:", error);
      showAlert("Failed to remove avatar. Please try again.", "Error", "error");
    } finally {
      setUploading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await userService.uploadAvatar(file);
      if (refreshUser) refreshUser();
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      showAlert("Failed to upload avatar. Please try again.", "Error", "error");
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (!user) return null;

  // Add a timestamp to prevent browser caching of the old avatar
  const avatarUrl = user.avatar_url
    ? `http://localhost:8000${user.avatar_url}?t=${new Date().getTime()}`
    : null;

  return (
    <Card className="mb-6">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
        <div className="relative">
          <div
            className="relative w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600 border-4 border-white shadow-lg cursor-pointer group overflow-hidden"
            onClick={handleAvatarClick}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              getInitials(user.full_name)
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {uploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              ) : (
                <FiCamera className="text-white w-6 h-6" />
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {user.avatar_url && (
            <button
              onClick={handleDeleteAvatarClick}
              className="absolute bottom-0 right-0 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition-colors z-10"
              title="Remove Avatar"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {user.full_name}
            </h1>
            {user.is_verified && (
              <FiCheckCircle
                className="text-blue-500 w-5 h-5"
                title="Verified Account"
              />
            )}
          </div>

          <p className="text-gray-500 mb-4">{user.email}</p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <FiClock className="w-4 h-4" />
              <span>
                Member since {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
              Active User
            </div>
          </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Remove Avatar
            </h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to remove your profile picture? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors font-medium"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAvatar}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium flex items-center justify-center min-w-[80px]"
                disabled={uploading}
              >
                {uploading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  "Remove"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ProfileHeader;
