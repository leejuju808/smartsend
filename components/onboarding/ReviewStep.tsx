// Block 21675 — Review & Launch Step Component
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewStep() {
  const router = useRouter();
  const [isLaunching, setIsLaunching] = useState(false);

  async function launchCampaign() {
    setIsLaunching(true);
    try {
      const res = await fetch("/api/onboarding/launch", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to launch campaign");
      }

      // Update onboarding step to complete
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "finish", completed: true }),
      });

      router.push("/onboarding/finish");
    } catch (error) {
      console.error("Error launching campaign:", error);
      setIsLaunching(false);
    }
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Review & Launch
        </h1>
        <p className="text-sm text-gray-600">
          Review your campaign settings and launch your first SmartSend campaign.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Campaign Summary
          </h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>✓ Email connected</li>
            <li>✓ Leads imported</li>
            <li>✓ Template selected</li>
            <li>✓ AI personalization applied</li>
          </ul>
        </div>

        <div className="p-4 border-2 border-blue-200 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Ready to launch!</strong> Your campaign will start sending
            personalized roofing emails to your leads.
          </p>
        </div>
      </div>

      <button
        onClick={launchCampaign}
        disabled={isLaunching}
        className="w-full px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >
        {isLaunching ? "Launching..." : "Launch Campaign"}
      </button>
    </div>
  );
}














































