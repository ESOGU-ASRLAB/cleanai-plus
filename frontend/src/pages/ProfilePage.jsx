import React, { useEffect, useState } from "react";
import { MainLayout } from "../components/layout";
import ProfileHeader from "../components/profile/ProfileHeader";
import StatsCards from "../components/profile/StatsCards";
import ActivityList from "../components/profile/ActivityList";
import ProfileSettings from "../components/profile/ProfileSettings";
import userService from "../services/userService";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../context/AlertContext";
import { FiUser, FiSettings, FiAlertTriangle } from "react-icons/fi";

const ProfilePage = () => {
  const { token, logout, fetchUser } = useAuth();
  const { showAlert } = useAlert();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab] = useState("overview"); // overview, settings
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const ACTIVITIES_PER_PAGE = 5;

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const [userData, statsData, activitiesData] = await Promise.all([
        userService.getMe(),
        userService.getStats(),
        userService.getActivities(ACTIVITIES_PER_PAGE),
      ]);
      setUser(userData);
      setStats(statsData);
      setActivities(activitiesData);
      setHasMoreActivities(activitiesData.length === ACTIVITIES_PER_PAGE);
      // Also update global user state for navbar
      if (fetchUser) fetchUser();
    } catch (error) {
      console.error("Failed to fetch profile data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreActivities = async () => {
    try {
      setLoadingMore(true);
      // Fetch next batch by increasing the limit
      // Note: A proper cursor-based pagination is better, but for now we fetch limit + offset
      // Since the backend only supports 'limit', we'll fetch current length + 5
      const nextLimit = activities.length + ACTIVITIES_PER_PAGE;
      const newActivitiesData = await userService.getActivities(nextLimit);

      setActivities(newActivitiesData);
      // If the new data length is less than what we asked for, we've reached the end
      setHasMoreActivities(newActivitiesData.length === nextLimit);
    } catch (error) {
      console.error("Failed to load more activities:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto">
        <ProfileHeader user={user} refreshUser={fetchProfileData} />

        <div className="flex border-b border-gray-200 mb-6">
          <button
            className={`py-2 px-4 font-medium flex items-center gap-2 ${
              activeTab === "overview"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("overview")}
          >
            <FiUser /> Overview
          </button>
          <button
            className={`py-2 px-4 font-medium flex items-center gap-2 ${
              activeTab === "settings"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("settings")}
          >
            <FiSettings /> Settings
          </button>
        </div>

        <div key={activeTab} className="animate-fade-in">
          {activeTab === "overview" ? (
            <div>
              <StatsCards stats={stats} />
              <ActivityList
                activities={activities}
                onLoadMore={loadMoreActivities}
                hasMore={hasMoreActivities}
                loadingMore={loadingMore}
              />
            </div>
          ) : (
            <div>
              <ProfileSettings user={user} refreshUser={fetchProfileData} />

              <div className="mt-8 border-t border-accent-100 pt-6">
                <h3 className="text-lg font-medium text-accent-600 mb-2 flex items-center">
                  <FiAlertTriangle className="mr-2" /> Danger Zone
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Once you delete your account, there is no going back. Please
                  be certain.
                </p>
                <button
                  className="w-full py-2 px-4 bg-accent-50 text-accent-600 border border-accent-200 rounded-lg hover:bg-accent-100 hover:text-accent-700 transition-colors font-medium flex justify-center items-center"
                  onClick={() =>
                    showAlert(
                      "Contact support to delete account.",
                      "Delete Account",
                      "error",
                    )
                  }
                >
                  Delete Account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default ProfilePage;
