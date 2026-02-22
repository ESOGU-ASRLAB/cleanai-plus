import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Button, Input, Card } from "../common";
import { Toast } from "../common/Toast";
import userService from "../../services/userService";

const ProfileSettings = ({ user, refreshUser }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      full_name: user?.full_name,
      email: user?.email,
    },
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const onSubmit = async (data) => {
    setLoading(true);
    setMessage(null);
    try {
      await userService.updateMe(data);
      setMessage({ type: "success", text: "Profile updated successfully!" });
      if (refreshUser) refreshUser();
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Failed to update profile." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold mb-4">Edit Profile</h2>
      {message && (
        <Toast
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
        />
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Full Name
          </label>
          <Input
            {...register("full_name", { required: "Full name is required" })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm"
          />
          {errors.full_name && (
            <span className="text-red-500 text-xs">
              {errors.full_name.message}
            </span>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email (Read-only)
          </label>
          <Input
            {...register("email")}
            disabled
            className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm sm:text-sm cursor-not-allowed"
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button type="submit" loading={loading} className="w-full sm:w-auto">
            Save Changes
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default ProfileSettings;
