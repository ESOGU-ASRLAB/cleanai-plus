import React from "react";
import { FiCheck } from "react-icons/fi";

export const Stepper = ({ steps, currentStep }) => {
  return (
    <div className="mb-12 px-4">
      <div className="relative">
        {/* Background Line */}
        <div className="absolute top-5 left-0 w-full h-1 bg-gray-100 rounded -translate-y-1/2 z-0"></div>

        {/* Active Progress Line */}
        <div
          className="absolute top-5 left-0 h-1 bg-primary-600 rounded -translate-y-1/2 z-0 transition-all duration-500 ease-out"
          style={{
            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
          }}
        ></div>

        {/* Steps */}
        <div className="relative z-10 flex justify-between w-full">
          {steps.map((step) => {
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;

            return (
              <div
                key={step.id}
                className="flex flex-col items-center group cursor-default"
                style={{ width: "60px" }}
              >
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 border-2
                    ${
                      isActive
                        ? "bg-primary-600 border-primary-600 text-white shadow-lg scale-110 ring-4 ring-primary-50"
                        : isCompleted
                          ? "bg-primary-600 border-primary-600 text-white"
                          : "bg-white border-gray-200 text-gray-400"
                    }
                  `}
                >
                  {isCompleted ? <FiCheck size={18} /> : step.id}
                </div>
                <div
                  className={`mt-3 text-xs font-medium text-center transition-colors duration-300 ${isActive ? "text-primary-700" : "text-gray-500"}`}
                >
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
