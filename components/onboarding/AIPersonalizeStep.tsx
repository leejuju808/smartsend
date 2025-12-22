// Block 21675 — AI Personalize Step Component
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type PersonalizedData = {
  preview: {
    subject: string;
    body: string;
  };
};

export default function AIPersonalizeStep() {
  const router = useRouter();
  const [data, setData] = useState<PersonalizedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function personalize() {
      try {
        const res = await fetch("/api/onboarding/personalize");
        if (res.ok) {
          const personalized = await res.json();
          setData(personalized);
        }
      } catch (error) {
        console.error("Error personalizing:", error);
      } finally {
        setIsLoading(false);
      }
    }
    personalize();
  }, []);

  async function next() {
    setIsSaving(true);
    try {
      // Update onboarding step
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "review" }),
      });

      router.push("/onboarding/review");
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">
            AI is personalizing your emails...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          AI Personalization Complete
        </h1>
        <p className="text-sm text-gray-600">
          SmartSend has personalized your emails with city references and roofing industry framing.
        </p>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg border">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Preview
            </h3>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-gray-500">Subject:</span>
                <p className="text-sm font-medium text-gray-900">
                  {data.preview.subject}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Body:</span>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {data.preview.body}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={next}
        disabled={isSaving}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >
        {isSaving ? "Saving..." : "Continue to Review"}
      </button>
    </div>
  );
}














































