import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/common";
import Navbar from "../components/layout/Navbar";

const features = [
  {
    color: "bg-primary-100 text-primary-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    ),
    title: "Model Execution",
    desc: "Run inference on your entire dataset. Get accuracy, F1 score, confusion matrix, and per-class breakdowns in seconds.",
  },
  {
    color: "bg-secondary-100 text-secondary-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
      />
    ),
    title: "Pruning & Optimization",
    desc: "Reduce model size and inference cost with configurable pruning strategies — L1, L2, random, and more.",
  },
  {
    color: "bg-emerald-100 text-emerald-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    ),
    title: "Dataset Management",
    desc: "Upload image datasets or pickle batches (CIFAR-style). CleanAI+ auto-detects class structure and labels.",
  },
  {
    color: "bg-violet-100 text-violet-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    ),
    title: "Preprocessing Pipelines",
    desc: "Build transform chains visually or in code — resize, normalize, augment — applied consistently across runs.",
  },
  {
    color: "bg-orange-100 text-orange-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    ),
    title: "Automated PDF Reports",
    desc: "Generate professional reports with confusion matrices, per-class accuracy, and carbon footprint data — one click.",
  },
  {
    color: "bg-teal-100 text-teal-600",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    title: "Carbon Footprint Tracking",
    desc: "Every execution measures energy consumption and CO₂ emissions so you can make eco-aware model decisions.",
  },
];

const steps = [
  {
    step: "01",
    title: "Upload Your Model & Dataset",
    desc: "Add your PyTorch model (full model, state dict, checkpoint, or safetensors) and your image dataset. CleanAI+ handles storage and versioning automatically.",
  },
  {
    step: "02",
    title: "Configure & Run",
    desc: "Create a workspace, attach your model and dataset, define a preprocessing pipeline, then trigger an execution or pruning job — all from a clean UI.",
  },
  {
    step: "03",
    title: "Analyze & Export",
    desc: "Explore detailed metrics, per-class accuracy charts, and confusion matrices. Download a polished PDF report to share your findings.",
  },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ── Hero ── */}
      <div className="relative min-h-[88vh] flex items-center justify-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-secondary-50" />
        <div className="absolute top-10 -left-10 w-80 h-80 bg-primary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob" />
        <div className="absolute top-10 -right-10 w-80 h-80 bg-secondary-200 rounded-full mix-blend-multiply filter blur-3xl opacity-40 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-10 left-1/3 w-80 h-80 bg-emerald-200 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />

        <div className="relative z-10 container mx-auto px-4 sm:px-8 text-center">
          <div className="animate-fade-in-up max-w-3xl mx-auto">
            {/* Badge */}
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
              <span className="w-2 h-2 bg-primary-500 rounded-full inline-block" />
              PyTorch Model Analysis Platform
            </span>

            <h1 className="text-gray-900 font-extrabold text-5xl sm:text-6xl leading-tight mb-6">
              Evaluate, Optimize &amp;{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-secondary-600">
                Report
              </span>{" "}
              Your AI Models
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
              CleanAI+ gives you a complete workspace to run inference, prune
              models, track carbon footprint, and generate professional PDF
              reports — without writing a single line of boilerplate.
            </p>
            <div className="flex justify-center flex-wrap gap-4">
              <Link to="/register">
                <Button size="lg">Get Started Free</Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" size="lg">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
            {[
              { value: "5+", label: "Model Formats" },
              { value: "10+", label: "Pruning Strategies" },
              { value: "PDF", label: "Auto Reports" },
              { value: "CO₂", label: "Emission Tracking" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-bold text-primary-600">{value}</div>
                <div className="text-sm text-gray-500 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Features ── */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need to understand your models
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              From raw inference to professional-grade reports, CleanAI+ covers the full post-training workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(({ color, icon, title, desc }) => (
              <div
                key={title}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300 p-7 flex flex-col gap-4"
              >
                <div className={`w-14 h-14 ${color} rounded-xl flex items-center justify-center`}>
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {icon}
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How it works
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Three straightforward steps from model file to actionable insights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            {steps.map(({ step, title, desc }, i) => (
              <div key={step} className="relative flex flex-col items-center text-center">
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+2.5rem)] w-[calc(100%-5rem)] h-px bg-gray-200" />
                )}
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-600 to-secondary-600 flex items-center justify-center text-white font-bold text-lg shadow-lg mb-5">
                  {step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-700">
        <div className="container mx-auto px-4 sm:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to analyze your model?
          </h2>
          <p className="text-primary-100 text-lg mb-8 max-w-lg mx-auto">
            Create a free account and run your first evaluation in minutes.
          </p>
          <Link
            to="/register"
            className="inline-block bg-white text-primary-700 hover:bg-primary-50 font-semibold text-lg px-8 py-3 rounded-lg shadow-lg transition-colors duration-200"
          >
            Create Free Account
          </Link>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
