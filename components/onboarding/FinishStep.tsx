// Block 21675 — Finish Step Component
"use client";

import { useRouter } from "next/navigation";

export default function FinishStep() {
  const router = useRouter();

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6 text-center">
      <div className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Your Roofing Campaign is Now Live!
          </h1>
          <p className="text-lg text-gray-600">
            SmartSend is now sending personalized roofing emails to your leads.
          </p>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900">
            <strong>What's next?</strong> Check your dashboard to see replies,
            track opens, and manage your campaign.
          </p>
        </div>
      </div>

      <button
        onClick={() => router.push("/dashboard")}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
      >
        Continue to Dashboard
      </button>
    </div>
  );
}














































