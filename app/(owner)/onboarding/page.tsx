// Block 21675 — SmartSend Roofing Onboarding Flow v1
// Main onboarding router - redirects to appropriate step

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/onboarding/state");
        if (res.ok) {
          const state = await res.json();

          // If completed, redirect to dashboard
          if (state.completed) {
            router.push("/dashboard");
            return;
          }

          // Route to current step
          const stepRoutes: Record<string, string> = {
            welcome: "/onboarding/welcome",
            "connect-email": "/onboarding/connect-email",
            "add-leads": "/onboarding/add-leads",
            "choose-template": "/onboarding/choose-template",
            "ai-personalize": "/onboarding/ai-personalize",
            review: "/onboarding/review",
            finish: "/onboarding/finish",
          };

          const redirectPath = stepRoutes[state.current_step] || "/onboarding/welcome";
          router.push(redirectPath);
        } else {
          // Default to welcome if status check fails
          router.push("/onboarding/welcome");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        router.push("/onboarding/welcome");
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














































