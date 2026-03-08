import React from "react";
import AuthLayout from "../components/layout/AuthLayout";
import RegisterForm from "../components/auth/RegisterForm";

const RegisterPage = () => {
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start optimizing your AI models with CleanAI+"
    >
      <RegisterForm />
    </AuthLayout>
  );
};

export default RegisterPage;
