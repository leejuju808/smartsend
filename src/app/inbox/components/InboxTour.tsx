"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

interface TourStep {
  id: string;
  title: string;
  body: string;
  targetSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

const tourSteps: TourStep[] = [
  {
    id: "intro",
    title: "All Your Roofing Replies In One Place",
    body: "Whenever a homeowner replies to your campaigns, they'll appear here automatically — no more digging through Gmail.",
    position: "center",
  },
  {
    id: "filters",
    title: "See Your Hottest Leads First",
    body: "Use these filters to jump straight to hot leads, warm leads, or follow-ups that need attention.",
    targetSelector: '[data-tour="filters"]',
    position: "bottom",
  },
  {
    id: "thread-list",
    title: "Each Row Is a Homeowner Conversation",
    body: "Click a name to open the full conversation, see how serious they are, and take action.",
    targetSelector: '[data-tour="thread-list"]',
    position: "right",
  },
  {
    id: "lead-detail",
    title: "This Is Where You Turn Leads Into Jobs",
    body: "See the full conversation, AI summary, and use the buttons to call, send an estimate, or mark a job as booked.",
    targetSelector: '[data-tour="lead-detail"]',
    position: "left",
  },
  {
    id: "metrics",
    title: "Track What SmartSend Is Doing For You",
    body: "These counters and events show how many replies you've received, hot leads, and booked estimates — all from SmartSend.",
    targetSelector: '[data-tour="metrics"]',
    position: "bottom",
  },
];

interface InboxTourProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function InboxTour({ onComplete, onSkip }: InboxTourProps) {
  // BLOCK 272500 — Internalization Sprint: coaching UI is OFF by default.
  if (!isCoachingUIEnabled()) return null;

  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;

  useEffect(() => {
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector) as HTMLElement;
      setTargetElement(element);
    } else {
      setTargetElement(null);
    }
  }, [step.targetSelector]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleComplete = async () => {
    try {
      await fetch("/api/inbox/owner/tour", { method: "POST" });
      onComplete();
    } catch (error) {
      console.error("Error completing tour:", error);
      onComplete(); // Still close tour even if API fails
    }
  };

  const handleSkip = () => {
    handleComplete();
    onSkip();
  };

  // Calculate overlay position and highlight
  const getOverlayStyle = () => {
    if (!targetElement) {
      return {
        clipPath: "none",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      };
    }

    const rect = targetElement.getBoundingClientRect();
    const padding = 8;

    return {
      clipPath: `polygon(
        0% 0%,
        0% 100%,
        ${rect.left - padding}px 100%,
        ${rect.left - padding}px ${rect.top - padding}px,
        ${rect.right + padding}px ${rect.top - padding}px,
        ${rect.right + padding}px ${rect.bottom + padding}px,
        ${rect.left - padding}px ${rect.bottom + padding}px,
        ${rect.left - padding}px 100%,
        100% 100%,
        100% 0%
      )`,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
    };
  };

  const getTooltipPosition = () => {
    if (!targetElement || step.position === "center") {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const rect = targetElement.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const spacing = 16;

    switch (step.position) {
      case "bottom":
        return {
          top: `${rect.bottom + spacing}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: "translateX(-50%)",
        };
      case "top":
        return {
          bottom: `${window.innerHeight - rect.top + spacing}px`,
          left: `${rect.left + rect.width / 2}px`,
          transform: "translateX(-50%)",
        };
      case "right":
        return {
          top: `${rect.top + rect.height / 2}px`,
          left: `${rect.right + spacing}px`,
          transform: "translateY(-50%)",
        };
      case "left":
        return {
          top: `${rect.top + rect.height / 2}px`,
          right: `${window.innerWidth - rect.left + spacing}px`,
          transform: "translateY(-50%)",
        };
      default:
        return {
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        };
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] pointer-events-auto"
      style={getOverlayStyle()}
    >
      {/* Tooltip */}
      <div
        className="fixed bg-white rounded-lg shadow-2xl p-6 max-w-sm pointer-events-auto"
        style={getTooltipPosition()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-gray-600 mb-4">{step.body}</p>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 ml-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Step {currentStep + 1} of {tourSteps.length}
          </div>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentStep((prev) => prev - 1)}
              >
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {isLastStep ? "Got it, take me to my Inbox" : "Next"}
            </Button>
          </div>
        </div>
      </div>

      {/* Highlight border around target element */}
      {targetElement && (
        <div
          className="fixed pointer-events-none border-2 border-primary rounded-lg shadow-lg"
          style={{
            top: `${targetElement.getBoundingClientRect().top - 8}px`,
            left: `${targetElement.getBoundingClientRect().left - 8}px`,
            width: `${targetElement.getBoundingClientRect().width + 16}px`,
            height: `${targetElement.getBoundingClientRect().height + 16}px`,
          }}
        />
      )}
    </div>
  );
}



















































