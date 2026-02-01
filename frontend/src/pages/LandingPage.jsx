import React from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/common";
import Navbar from "../components/layout/Navbar";

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <div className="relative pt-16 pb-32 flex content-center items-center justify-center min-h-[85vh]">
        <div className="absolute top-0 w-full h-full bg-center bg-cover overflow-hidden">
          {/* Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary-50 to-white" />

          {/* Animated Blobs */}
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>
        </div>

        <div className="container relative mx-auto px-4 sm:px-8">
          <div className="items-center flex flex-wrap">
            <div className="w-full lg:w-6/12 px-4 ml-auto mr-auto text-center">
              <div className="animate-fade-in-up">
                <h1 className="text-gray-900 font-bold text-5xl mb-6">
                  Build and Train Models with{" "}
                  <span className="text-primary-600">Confidence</span>
                </h1>
                <p className="mt-4 text-lg text-gray-500 mb-10">
                  CleanAI offers a seamless platform for PyTorch model
                  management. Upload, train, and deploy your deep learning
                  models in minutes, not days.
                </p>
                <div className="flex justify-center gap-4">
                  <Link to="/register">
                    <Button size="lg">Start Building Free</Button>
                  </Link>
                  <a
                    href="https://pytorch.org"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" size="lg">
                      Learn PyTorch
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Section */}
      <section className="pb-20 bg-white -mt-24 relative z-10 px-4">
        <div className="container mx-auto">
          <div className="flex flex-wrap justify-center">
            {/* Card 1 */}
            <div className="w-full md:w-4/12 px-4 text-center">
              <div className="relative flex flex-col min-w-0 break-words bg-white w-full mb-8 shadow-lg rounded-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 p-6">
                <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </div>
                <h6 className="text-xl font-semibold mb-2">Easy Upload</h6>
                <p className="text-gray-500">
                  Drag and drop your PyTorch model files and datasets. We handle
                  the versioning and storage for you.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="w-full md:w-4/12 px-4 text-center">
              <div className="relative flex flex-col min-w-0 break-words bg-white w-full mb-8 shadow-lg rounded-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 p-6">
                <div className="w-16 h-16 bg-secondary-100 text-secondary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                </div>
                <h6 className="text-xl font-semibold mb-2">Auto-Training</h6>
                <p className="text-gray-500">
                  Select your hyperparameters and let our optimized
                  infrastructure train your models efficiently.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="w-full md:w-4/12 px-4 text-center">
              <div className="relative flex flex-col min-w-0 break-words bg-white w-full mb-8 shadow-lg rounded-lg border border-gray-100 hover:shadow-xl transition-shadow duration-300 p-6">
                <div className="w-16 h-16 bg-accent-100 text-accent-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <h6 className="text-xl font-semibold mb-2">Visual Analytics</h6>
                <p className="text-gray-500">
                  Track loss, accuracy, and other metrics in real-time with our
                  beautiful interactive dashboards.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
