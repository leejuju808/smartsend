// Block 21675 — Welcome Step Component
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WelcomeStep() {
  const router = useRouter();

  useEffect(() => {
    // Initialize onboarding state if needed
    async function initOnboarding() {
      try {
        await fetch("/api/onboarding/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_step: "welcome" }),
        });
      } catch (error) {
        console.error("Error initializing onboarding:", error);
      }
    }
    initOnboarding();
  }, []);

  async function next() {
    try {
      // Update step to connect-email
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "connect-email" }),
      });
      router.push("/onboarding/connect-email");
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      router.push("/onboarding/connect-email");
    }
  }

  return (
    <div className="space-y-6 bg-white p-8 rounded-xl shadow-sm border">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome to SmartSend
        </h1>
        <p className="text-lg text-gray-600">
          Get Your First Roofing Campaign Live in 15 Minutes
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-gray-600 text-center">
          Let's launch your first roofing campaign. This takes about 15 minutes.
        </p>

        <ul className="list-disc pl-6 text-sm text-gray-700 space-y-2">
          <li>Connect your email</li>
          <li>Add homeowner leads</li>
          <li>Pick a roofing template</li>
          <li>Launch your first SmartSend campaign</li>
        </ul>
      </div>

      <div className="pt-4">
        <button
          onClick={next}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}














































