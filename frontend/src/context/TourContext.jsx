import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const TourContext = createContext(null);

export const TourProvider = ({ children }) => {
  const [isTourActive, setIsTourActive] = useState(false);
  const [steps, setSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const registryRef = useRef({});

  const startTour = useCallback((tourSteps) => {
    setSteps(tourSteps);
    setCurrentStepIndex(0);
    setIsTourActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
  }, [steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prev) => (prev > 0 ? prev - 1 : 0));
  }, []);

  const endTour = useCallback(() => {
    setIsTourActive(false);
    setSteps([]);
    setCurrentStepIndex(0);
  }, []);

  const registerTour = useCallback((key, getSteps) => {
    registryRef.current[key] = getSteps;
  }, []);

  const startNamedTour = useCallback(
    (key) => {
      const getSteps = registryRef.current[key];
      if (getSteps) startTour(getSteps());
    },
    [startTour],
  );

  return (
    <TourContext.Provider
      value={{
        isTourActive,
        steps,
        currentStepIndex,
        currentStep: steps[currentStepIndex] || null,
        totalSteps: steps.length,
        startTour,
        nextStep,
        prevStep,
        endTour,
        skipTour: endTour,
        registerTour,
        startNamedTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
};

export default TourContext;
