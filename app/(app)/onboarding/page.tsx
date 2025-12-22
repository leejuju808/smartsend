// Block 11000 — SmartSend 15-Minute Roofer Onboarding v1
// Main onboarding router - redirects to appropriate step

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type OnboardingStatus = {
  step_1_done: boolean;
  step_2_done: boolean;
  step_3_done: boolean;
  step_4_done: boolean;
  completed: boolean;
};

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/onboarding/status-block11000");
        if (res.ok) {
          const status: OnboardingStatus = await res.json();

          // If all steps completed, redirect to dashboard
          if (status.completed) {
            router.push("/dashboard");
            return;
          }

          // Route to first incomplete step
          if (!status.step_1_done) {
            router.push("/onboarding/step-1-company");
          } else if (!status.step_2_done) {
            router.push("/onboarding/step-2-email");
          } else if (!status.step_3_done) {
            router.push("/onboarding/step-3-contacts");
          } else if (!status.step_4_done) {
            router.push("/onboarding/step-4-launch");
          } else {
            router.push("/dashboard");
          }
        } else {
          // Default to step 1 if status check fails
          router.push("/onboarding/step-1-company");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        router.push("/onboarding/step-1-company");
      }
    }
    checkStatus();
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto"></div>
        <p className="mt-4 text-sm text-gray-600">Loading onboarding...</p>
      </div>
    </div>
  );
}





