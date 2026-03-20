import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { FiX, FiArrowRight, FiArrowLeft } from "react-icons/fi";
import { useTour } from "../../context/TourContext";

const PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_ESTIMATE_HEIGHT = 200;

const TourOverlay = () => {
  const {
    isTourActive,
    currentStep,
    currentStepIndex,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);

  const measureTarget = useCallback(() => {
    if (!currentStep || !currentStep.target) {
      setRect(null);
      setReady(true);
      return;
    }
    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
    setReady(true);
  }, [currentStep]);

  // Re-measure when step changes
  useEffect(() => {
    if (!isTourActive) return;
    setReady(false);
    setRect(null);

    const activate = () => {
      if (currentStep?.onActivate) currentStep.onActivate();
    };

    activate();

    // Allow DOM to update before measuring
    const t = setTimeout(() => {
      measureTarget();
      if (currentStep?.target) {
        const el = document.querySelector(
          `[data-tour="${currentStep.target}"]`,
        );
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Re-measure after scroll settles
        setTimeout(measureTarget, 350);
      }
    }, 100);

    return () => clearTimeout(t);
  }, [isTourActive, currentStep, measureTarget]);

  // Re-measure on resize / scroll
  useEffect(() => {
    if (!isTourActive) return;
    const handle = () => measureTarget();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [isTourActive, measureTarget]);

  if (!isTourActive || !currentStep || !ready) return null;

  // ── Spotlight style ──
  const spotlightStyle = rect
    ? {
        position: "fixed",
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
        borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
        zIndex: 10000,
        pointerEvents: "none",
        transition: "top 0.25s, left 0.25s, width 0.25s, height 0.25s",
      }
    : null;

  // ── Tooltip position ──
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let tooltipStyle;

  if (!rect) {
    tooltipStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TOOLTIP_WIDTH,
      zIndex: 10001,
    };
  } else {
    const pos = currentStep.position || "bottom";
    let top, left;

    if (pos === "bottom") {
      top = rect.top + rect.height + PADDING + 12;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else if (pos === "top") {
      top = rect.top - PADDING - TOOLTIP_ESTIMATE_HEIGHT - 12;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    } else if (pos === "right") {
      top = rect.top + rect.height / 2 - TOOLTIP_ESTIMATE_HEIGHT / 2;
      left = rect.left + rect.width + PADDING + 12;
    } else {
      // left
      top = rect.top + rect.height / 2 - TOOLTIP_ESTIMATE_HEIGHT / 2;
      left = rect.left - TOOLTIP_WIDTH - PADDING - 12;
    }

    // Clamp to viewport
    left = Math.max(16, Math.min(left, winW - TOOLTIP_WIDTH - 16));
    top = Math.max(16, Math.min(top, winH - TOOLTIP_ESTIMATE_HEIGHT - 16));

    tooltipStyle = {
      position: "fixed",
      top,
      left,
      width: TOOLTIP_WIDTH,
      zIndex: 10001,
    };
  }

  const isLast = currentStepIndex === totalSteps - 1;

  return ReactDOM.createPortal(
    <>
      {/* Backdrop for center-modal steps */}
      {!rect && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 10000,
          }}
        />
      )}

      {/* Spotlight highlight ring */}
      {rect && <div style={spotlightStyle} />}

      {/* Tooltip card */}
      <div
        style={tooltipStyle}
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary-400 to-primary-600" />

        <div className="p-5">
          {/* Title row */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold">
                {currentStepIndex + 1}
              </span>
              <h3 className="text-sm font-semibold text-gray-900 leading-tight">
                {currentStep.title}
              </h3>
            </div>
            <button
              onClick={skipTour}
              className="ml-2 flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Close tour"
            >
              <FiX size={16} />
            </button>
          </div>

          {/* Content */}
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {currentStep.content}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStepIndex
                    ? "w-4 bg-primary-500"
                    : i < currentStepIndex
                      ? "w-1.5 bg-primary-200"
                      : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <button
              onClick={skipTour}
              className="text-xs text-gray-400 hover:text-gray-500 transition-colors"
            >
              Skip tour
            </button>
            <div className="flex gap-2">
              {currentStepIndex > 0 && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <FiArrowLeft size={12} /> Back
                </button>
              )}
              <button
                onClick={isLast ? skipTour : nextStep}
                className={`flex items-center gap-1 px-4 py-1.5 text-xs text-white rounded-lg transition-colors font-medium ${
                  isLast
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-primary-600 hover:bg-primary-700"
                }`}
              >
                {isLast ? "Finish" : "Next"} <FiArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default TourOverlay;
