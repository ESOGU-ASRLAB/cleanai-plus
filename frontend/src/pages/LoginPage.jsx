import React from "react";
import AuthLayout from "../components/layout/AuthLayout";
import LoginForm from "../components/auth/LoginForm";

const LoginPage = () => {
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account">
      <LoginForm />
    </AuthLayout>
  );
};

export default LoginPage;
