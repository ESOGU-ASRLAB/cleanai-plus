import React from "react";
import {
  FiActivity,
  FiDatabase,
  FiCpu,
  FiUser,
  FiFolder,
  FiUploadCloud,
  FiPlayCircle,
} from "react-icons/fi";
import { formatDistanceToNow } from "date-fns";

const getActivityIcon = (action) => {
  const actionLower = action.toLowerCase();
  if (actionLower.includes("workspace"))
    return (
      <FiFolder className="mt-1 mr-4 text-purple-500 w-5 h-5 flex-shrink-0" />
    );
  if (actionLower.includes("upload") && actionLower.includes("model"))
    return (
      <FiUploadCloud className="mt-1 mr-4 text-indigo-500 w-5 h-5 flex-shrink-0" />
    );
  if (actionLower.includes("execution") || actionLower.includes("started"))
    return (
      <FiPlayCircle className="mt-1 mr-4 text-blue-500 w-5 h-5 flex-shrink-0" />
    );
  if (actionLower.includes("model"))
    return <FiCpu className="mt-1 mr-4 text-blue-500 w-5 h-5 flex-shrink-0" />;
  if (actionLower.includes("dataset"))
    return (
      <FiDatabase className="mt-1 mr-4 text-green-500 w-5 h-5 flex-shrink-0" />
    );
  if (actionLower.includes("profile") || actionLower.includes("user"))
    return (
      <FiUser className="mt-1 mr-4 text-orange-500 w-5 h-5 flex-shrink-0" />
    );
  return (
    <FiActivity className="mt-1 mr-4 text-gray-500 w-5 h-5 flex-shrink-0" />
  );
};

const formatDetails = (details) => {
  if (!details || Object.keys(details).length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {Object.entries(details).map(([key, value]) => {
        // Skip internal IDs or complex objects
        if (key.endsWith("_id") || typeof value === "object") return null;

        return (
          <span
            key={key}
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200"
          >
            <span className="font-semibold mr-1 capitalize">
              {key.replace(/_/g, " ")}:
            </span>
            {String(value)}
          </span>
        );
      })}
    </div>
  );
};

const ActivityItem = ({ activity }) => {
  const icon = getActivityIcon(activity.action);

  return (
    <div className="flex items-start p-4 hover:bg-gray-50 transition-colors duration-200 border-b border-gray-100 last:border-0">
      {icon}
      <div className="flex-1">
        <div className="flex justify-between items-baseline mb-1">
          <p className="font-semibold text-gray-800 capitalize">
            {activity.action.replace(/_/g, " ")}
          </p>
          <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
            {formatDistanceToNow(new Date(activity.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
        {formatDetails(activity.details)}
      </div>
    </div>
  );
};

const ActivityList = ({ activities, onLoadMore, hasMore, loadingMore }) => {
  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <FiActivity className="mx-auto w-10 h-10 text-gray-400 mb-2" />
        <p className="text-gray-500 font-medium">No recent activities found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h3 className="font-bold text-gray-800">Recent Activities</h3>
      </div>
      <div>
        {activities.map((activity, index) => (
          <ActivityItem key={index} activity={activity} />
        ))}
      </div>
      {hasMore && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors flex items-center gap-2"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default ActivityList;
