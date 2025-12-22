"use client";

// Block 16800 — SmartSend Trials & Onboarding v2
// Main onboarding page that routes to the appropriate step

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingStep1 } from "@/components/onboarding/v2/steps/Step1CompanySetup";
import { OnboardingStep2 } from "@/components/onboarding/v2/steps/Step2EmailConnect";
import { OnboardingStep3 } from "@/components/onboarding/v2/steps/Step3ImportList";
import { OnboardingStep4 } from "@/components/onboarding/v2/steps/Step4LaunchCampaign";
import { OnboardingStep5 } from "@/components/onboarding/v2/steps/Step5BookInspection";

export default function OnboardingV2Page() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProgress() {
      try {
        const res = await fetch("/api/onboarding/v2/progress");
        if (res.ok) {
          const data = await res.json();
          if (data.progress) {
            setCurrentStep(data.progress.current_step || 1);
            
            // If onboarding is complete, redirect to dashboard
            if (data.progress.completed) {
              router.push("/dashboard?onboarding=complete");
              return;
            }
          }
        }
      } catch (error) {
        console.error("Error loading progress:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProgress();
  }, [router]);

  const handleStepComplete = async (step: number, stepData?: any) => {
    try {
      const res = await fetch("/api/onboarding/v2/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: step + 1,
          stepData,
        }),
      });

      if (res.ok) {
        if (step < 5) {
          setCurrentStep(step + 1);
        } else {
          // Complete onboarding
          await fetch("/api/onboarding/v2/complete", { method: "POST" });
          router.push("/dashboard?onboarding=complete");
        }
      }
    } catch (error) {
      console.error("Error updating progress:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">SmartSend Setup</h1>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of 5
            </span>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`flex-1 h-2 rounded-full ${
                  step <= currentStep
                    ? "bg-primary"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        {currentStep === 1 && (
          <OnboardingStep1 onComplete={(data) => handleStepComplete(1, data)} />
        )}
        {currentStep === 2 && (
          <OnboardingStep2 onComplete={(data) => handleStepComplete(2, data)} />
        )}
        {currentStep === 3 && (
          <OnboardingStep3 onComplete={(data) => handleStepComplete(3, data)} />
        )}
        {currentStep === 4 && (
          <OnboardingStep4 onComplete={(data) => handleStepComplete(4, data)} />
        )}
        {currentStep === 5 && (
          <OnboardingStep5 onComplete={(data) => handleStepComplete(5, data)} />
        )}
      </div>
    </div>
  );
}





















































