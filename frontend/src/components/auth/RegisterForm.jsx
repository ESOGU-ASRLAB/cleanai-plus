import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FiUser,
  FiMail,
  FiLock,
  FiEye,
  FiEyeOff,
  FiCheckCircle,
} from "react-icons/fi";
import { Button, Input, Card } from "../common";

const RegisterForm = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(1); // 1: Register, 2: Verify
  const [verificationCode, setVerificationCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const endTimeRef = useRef(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    if (step !== 2) return;

    // Initialize end time if not set
    if (!endTimeRef.current) {
      const storedEndTime = localStorage.getItem("registerVerifyEndTime");
      if (storedEndTime) {
        const parsedEndTime = parseInt(storedEndTime, 10);
        if (parsedEndTime > Date.now()) {
          endTimeRef.current = parsedEndTime;
          setTimeLeft(Math.floor((parsedEndTime - Date.now()) / 1000));
        } else {
          localStorage.removeItem("registerVerifyEndTime");
          const newEndTime = Date.now() + 180 * 1000;
          endTimeRef.current = newEndTime;
          localStorage.setItem("registerVerifyEndTime", newEndTime.toString());
        }
      } else {
        const newEndTime = Date.now() + 180 * 1000;
        endTimeRef.current = newEndTime;
        localStorage.setItem("registerVerifyEndTime", newEndTime.toString());
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
  }, [step]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: formData.fullName,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Registration failed");
      }

      // Success - move to verification step
      setStep(2);
      const newEndTime = Date.now() + 180 * 1000;
      endTimeRef.current = newEndTime;
      localStorage.setItem("registerVerifyEndTime", newEndTime.toString());
      setTimeLeft(180);
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (verificationCode.length !== 5) {
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
            email: formData.email,
            code: verificationCode,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Verification failed");
      }

      // Success - redirect to login
      localStorage.removeItem("registerVerifyEndTime");
      navigate("/login", {
        state: { message: "Account verified successfully. Please login." },
      });
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
            email: formData.email,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to resend code");
      }

      const newEndTime = Date.now() + 180 * 1000;
      endTimeRef.current = newEndTime;
      localStorage.setItem("registerVerifyEndTime", newEndTime.toString());
      setTimeLeft(180);
      setErrors({ verify: "" });
    } catch (error) {
      setErrors({ verify: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <Card className="animate-slide-up">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mb-4">
            <FiMail size={24} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Verify your email
          </h2>
          <p className="text-gray-600 mt-2">
            We've sent a 5-digit code to{" "}
            <span className="font-medium text-gray-900">{formData.email}</span>
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-5">
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
            disabled={verificationCode.length !== 5}
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
    );
  }

  return (
    <Card className="animate-slide-up">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name */}
        <Input
          label="Full Name"
          name="fullName"
          type="text"
          placeholder="John Doe"
          value={formData.fullName}
          onChange={handleChange}
          icon={FiUser}
          error={errors.fullName}
        />

        {/* Email */}
        <Input
          label="Email Address"
          name="email"
          type="email"
          placeholder="john@example.com"
          value={formData.email}
          onChange={handleChange}
          icon={FiMail}
          error={errors.email}
        />

        {/* Password */}
        <div className="relative">
          <Input
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.password}
            onChange={handleChange}
            icon={FiLock}
            error={errors.password}
            helperText="Must be at least 8 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
          </button>
        </div>

        {/* Confirm Password */}
        <div className="relative">
          <Input
            label="Confirm Password"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            placeholder="••••••••"
            value={formData.confirmPassword}
            onChange={handleChange}
            icon={FiLock}
            error={errors.confirmPassword}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
          >
            {showConfirmPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
          </button>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div className="p-3 bg-accent-50 border border-accent-200 rounded-lg">
            <p className="text-sm text-accent-700">{errors.submit}</p>
          </div>
        )}

        {/* Submit Button */}
        <Button type="submit" fullWidth loading={loading} size="lg">
          Create Account
        </Button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">
              Already have an account?
            </span>
          </div>
        </div>

        {/* Login Link */}
        <div className="text-center">
          <Link
            to="/login"
            className="text-primary-600 hover:text-primary-700 font-medium transition-colors"
          >
            Sign in instead
          </Link>
        </div>
      </form>
    </Card>
  );
};

export default RegisterForm;
