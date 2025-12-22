"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StepReviewLaunch({
  template,
  targeting,
  personalize,
  back,
}: {
  template: any;
  targeting: any;
  personalize: any;
  back: () => void;
}) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);

  async function launch() {
    setLaunching(true);
    try {
      const res = await fetch("/api/campaigns/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: template.id,
          targeting,
          personalize,
        }),
      });

      const data = await res.json();
      if (data.status === "ok" && data.campaign_id) {
        router.push(`/campaigns/${data.campaign_id}`);
      } else {
        alert(data.error || "Failed to launch campaign");
        setLaunching(false);
      }
    } catch (error) {
      console.error("Launch error:", error);
      alert("Failed to launch campaign. Please try again.");
      setLaunching(false);
    }
  }

  // Calculate estimated metrics (industry benchmarks)
  const estimatedReplies = Math.round(
    (targeting.daily_limit * targeting.send_days.length * 4 * 0.08) || 0
  ); // ~8% reply rate
  const estimatedJobs = Math.round(estimatedReplies * 0.15) || 0; // ~15% conversion

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Review & Launch</h1>
        <p className="text-sm text-gray-600 mt-1">
          Review your campaign settings before launching.
        </p>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Template:</span>
          <span className="font-medium">{template?.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">City:</span>
          <span className="font-medium">{targeting.city}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Daily Limit:</span>
          <span className="font-medium">{targeting.daily_limit} emails/day</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Send Days:</span>
          <span className="font-medium">
            {targeting.send_days.map((d: string) => d.toUpperCase()).join(", ")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Sender:</span>
          <span className="font-medium">
            {personalize.sender_name} ({personalize.company_name})
          </span>
        </div>
      </div>

      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Estimated Timeline:</span>
          <span className="font-medium">
            {targeting.send_days.length * 4} weeks
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Estimated Replies:</span>
          <span className="font-medium text-blue-600">{estimatedReplies}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Estimated Jobs:</span>
          <span className="font-medium text-green-600">{estimatedJobs}</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Based on industry benchmarks for roofing outreach campaigns.
        </p>
      </div>

      <div className="space-y-2 pt-4">
        <button
          onClick={launch}
          disabled={launching}
          className="px-4 py-2 bg-green-600 text-white rounded-md w-full disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700"
        >
          {launching ? "Launching..." : "Launch Campaign"}
        </button>

        <button
          onClick={back}
          disabled={launching}
          className="mt-2 px-3 py-2 text-sm border rounded-md w-full hover:bg-gray-50 disabled:opacity-40"
        >
          Back
        </button>
      </div>
    </div>
  );
}














































