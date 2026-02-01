import React from "react";
import AuthLayout from "../components/layout/AuthLayout";
import RegisterForm from "../components/auth/RegisterForm";

const RegisterPage = () => {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your journey with PyTorch Model Platform"
    >
      <RegisterForm />
    </AuthLayout>
  );
};

export default RegisterPage;
