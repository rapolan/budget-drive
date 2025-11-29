import React from 'react';
import { Check } from 'lucide-react';

interface Step {
  number: number;
  label: string;
}

interface ProgressStepperProps {
  steps: Step[];
  currentStep: number;
}

export const ProgressStepper: React.FC<ProgressStepperProps> = ({ steps, currentStep }) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.number;
          const isActive = currentStep === step.number;
          const isLast = index === steps.length - 1;

          return (
            <React.Fragment key={step.number}>
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    flex h-10 w-10 items-center justify-center rounded-full border-2
                    transition-all duration-300 ease-in-out
                    ${
                      isCompleted
                        ? 'border-green-500 bg-green-500 text-white scale-110'
                        : isActive
                        ? 'border-blue-600 bg-blue-600 text-white scale-110 shadow-lg'
                        : 'border-gray-300 bg-white text-gray-500'
                    }
                  `}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 animate-in fade-in zoom-in duration-300" />
                  ) : (
                    <span className="text-sm font-semibold">{step.number}</span>
                  )}
                </div>
                <span
                  className={`
                    mt-2 text-xs font-medium transition-colors duration-300
                    ${
                      isCompleted || isActive
                        ? 'text-gray-900'
                        : 'text-gray-500'
                    }
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div className="flex-1 px-2">
                  <div className="relative h-0.5 bg-gray-200">
                    <div
                      className={`
                        absolute left-0 top-0 h-full transition-all duration-500 ease-in-out
                        ${
                          isCompleted
                            ? 'w-full bg-green-500'
                            : isActive
                            ? 'w-1/2 bg-blue-600'
                            : 'w-0 bg-gray-300'
                        }
                      `}
                    />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
