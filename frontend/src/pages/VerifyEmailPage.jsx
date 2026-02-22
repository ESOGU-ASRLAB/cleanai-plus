import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { FiMail } from "react-icons/fi";
import AuthLayout from "../components/layout/AuthLayout";
import { Button, Card } from "../components/common";
import { useAuth } from "../context/AuthContext";

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, fetchUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [verificationCode, setVerificationCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const endTimeRef = useRef(null);

  // Get email from location state or URL params
  const email = location.state?.email || searchParams.get("email");
  const codeFromUrl = searchParams.get("code");

  useEffect(() => {
    if (!email) {
      if (user) {
        navigate("/dashboard");
      } else {
        navigate("/login");
      }
      return;
    }

    // If code is in URL, set it and auto-verify
    if (codeFromUrl && codeFromUrl.length === 5) {
      setVerificationCode(codeFromUrl);
      // We need to wait for state to update before verifying
      setTimeout(() => {
        const form = document.getElementById("verify-form");
        if (form)
          form.dispatchEvent(
            new Event("submit", { cancelable: true, bubbles: true }),
          );
      }, 100);
    }

    // Initialize end time if not set
    if (!endTimeRef.current) {
      const storedEndTime = localStorage.getItem("verifyEmailEndTime");
      if (storedEndTime) {
        const parsedEndTime = parseInt(storedEndTime, 10);
        if (parsedEndTime > Date.now()) {
          endTimeRef.current = parsedEndTime;
          setTimeLeft(Math.floor((parsedEndTime - Date.now()) / 1000));
        } else {
          localStorage.removeItem("verifyEmailEndTime");
          const newEndTime = Date.now() + 180 * 1000;
          endTimeRef.current = newEndTime;
          localStorage.setItem("verifyEmailEndTime", newEndTime.toString());
        }
      } else {
        const newEndTime = Date.now() + 180 * 1000;
        endTimeRef.current = newEndTime;
        localStorage.setItem("verifyEmailEndTime", newEndTime.toString());
      }
    }

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
  }, [email, codeFromUrl, navigate]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    // Use the code from state or URL
    const codeToVerify = verificationCode || codeFromUrl;

    if (!codeToVerify || codeToVerify.length !== 5) {
      setErrors({ verify: "Code must be 5 digits" });
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
            email: email,
            code: codeToVerify,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Verification failed");
      }

      // Success - redirect based on auth state
      localStorage.removeItem("verifyEmailEndTime");
      if (user) {
        if (fetchUser) await fetchUser();
        navigate("/dashboard");
      } else {
        navigate("/login", {
          state: { message: "Account verified successfully. Please login." },
        });
      }
    } catch (error) {
      setErrors({ verify: error.message });
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
            email: email,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to resend code");
      }

      // Reset timer
      const newEndTime = Date.now() + 180 * 1000;
      endTimeRef.current = newEndTime;
      localStorage.setItem("verifyEmailEndTime", newEndTime.toString());
      setTimeLeft(180);
      setErrors({ verify: "" });
    } catch (error) {
      setErrors({ verify: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!email) return null;

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="We've sent a verification code to your email"
    >
      <Card className="animate-slide-up">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mb-4">
            <FiMail size={24} />
          </div>
          <p className="text-gray-600 mt-2">
            We've sent a 5-digit code to{" "}
            <span className="font-medium text-gray-900">{email}</span>
          </p>
        </div>

        <form id="verify-form" onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Verification Code
            </label>
            <input
              type="text"
              maxLength={5}
              value={verificationCode}
              onChange={(e) =>
                setVerificationCode(e.target.value.replace(/\D/g, ""))
              }
              className="w-full text-center text-2xl tracking-[0.5em] font-bold py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              placeholder="00000"
            />
            {errors.verify && (
              <p className="mt-1 text-sm text-red-600">{errors.verify}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={loading}
            disabled={
              (!verificationCode || verificationCode.length !== 5) &&
              !codeFromUrl
            }
          >
            Verify Account
          </Button>

          <div className="text-center mt-4">
            {timeLeft > 0 ? (
              <p className="text-sm text-gray-600">
                Code expires in{" "}
                <span className="font-medium text-primary-600">
                  {formatTime(timeLeft)}
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-600">Code has expired</p>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="text-sm font-medium text-primary-600 hover:text-primary-500"
                >
                  Resend Code
                </button>
              </div>
            )}
          </div>
        </form>
      </Card>
    </AuthLayout>
  );
};

export default VerifyEmailPage;
