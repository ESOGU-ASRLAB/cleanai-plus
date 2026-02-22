import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card } from "../common";
import { FiMail, FiCheckCircle } from "react-icons/fi";
import { useToast } from "../../context/ToastContext";

const ProfileVerification = ({ user, refreshUser }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const endTimeRef = useRef(null);

  useEffect(() => {
    // Check if we just arrived from dashboard with verify=true
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("verify") === "true") {
      // Start timer since a code was just sent
      const newEndTime = Date.now() + 180 * 1000;
      endTimeRef.current = newEndTime;
      localStorage.setItem("verificationEndTime", newEndTime.toString());
      setTimeLeft(180);
      toast.success("A new verification code has been sent to your email.");

      // Clean up URL
      navigate(location.pathname, { replace: true });
    } else {
      // Check if there's an existing timer in localStorage
      const storedEndTime = localStorage.getItem("verificationEndTime");
      if (storedEndTime) {
        const parsedEndTime = parseInt(storedEndTime, 10);
        if (parsedEndTime > Date.now()) {
          endTimeRef.current = parsedEndTime;
          setTimeLeft(Math.floor((parsedEndTime - Date.now()) / 1000));
        } else {
          localStorage.removeItem("verificationEndTime");
        }
      }
    }
  }, [location, navigate]);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(
        0,
        Math.floor((endTimeRef.current - now) / 1000),
      );

      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (verificationCode.length !== 5) {
      toast.error("Code must be 5 digits");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/auth/verify-email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
            code: verificationCode,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Verification failed");
      }

      toast.success("Account verified successfully!");
      localStorage.removeItem("verificationEndTime");
      if (refreshUser) refreshUser();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        "http://localhost:8000/api/auth/resend-verification",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to resend code");
      }

      const newEndTime = Date.now() + 180 * 1000;
      endTimeRef.current = newEndTime;
      localStorage.setItem("verificationEndTime", newEndTime.toString());
      setTimeLeft(180);
      toast.success("Verification code sent successfully!");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (user?.is_verified) {
    return (
      <Card className="p-6 bg-green-50 border border-green-200">
        <div className="flex items-center">
          <FiCheckCircle className="text-green-500 w-6 h-6 mr-3" />
          <div>
            <h3 className="text-lg font-medium text-green-800">
              Account Verified
            </h3>
            <p className="text-sm text-green-600">
              Your email address has been successfully verified.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center mb-4">
        <div className="bg-blue-100 p-2 rounded-full mr-3">
          <FiMail className="text-blue-600 w-5 h-5" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Verify Your Account</h2>
      </div>

      <p className="text-gray-600 mb-6 text-sm">
        Please enter the 5-digit verification code sent to{" "}
        <strong>{user?.email}</strong> to unlock all features.
      </p>

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Verification Code
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              maxLength={5}
              value={verificationCode}
              onChange={(e) =>
                setVerificationCode(e.target.value.replace(/\D/g, ""))
              }
              className="flex-1 text-center text-xl tracking-[0.5em] font-bold py-2 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              placeholder="00000"
            />
            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              disabled={verificationCode.length !== 5}
              className="px-6"
            >
              Verify
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {timeLeft > 0 ? (
            <p className="text-sm text-gray-500">
              Code expires in{" "}
              <span className="font-medium text-primary-600">
                {formatTime(timeLeft)}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-500">Didn't receive the code?</p>
          )}

          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || timeLeft > 0}
            className={`text-sm font-medium ${
              timeLeft > 0
                ? "text-gray-400 cursor-not-allowed"
                : "text-primary-600 hover:text-primary-500"
            }`}
          >
            Resend Code
          </button>
        </div>
      </form>
    </Card>
  );
};

export default ProfileVerification;
