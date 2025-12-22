// Block 11000 — Step 4: One-Click Campaign Launch
// Screen: "Start Your First SmartSend Campaign"

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Step4LaunchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [campaignName, setCampaignName] = useState("Old Quotes Reactivation");
  const [listId, setListId] = useState<string | null>(null);
  const [availableLists, setAvailableLists] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    // Load available contact lists
    async function loadLists() {
      try {
        const res = await fetch("/api/contact-lists");
        if (res.ok) {
          const data = await res.json();
          setAvailableLists(data.lists || []);
          if (data.lists && data.lists.length > 0) {
            const oldQuotesList = data.lists.find((l: any) => l.name === "Old Quotes");
            setListId(oldQuotesList?.id || data.lists[0].id);
          }
        }
      } catch (error) {
        console.error("Error loading lists:", error);
      }
    }
    loadLists();
  }, []);

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/step-4-launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          listId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to launch campaign");
        setLoading(false);
        return;
      }

      const data = await res.json();
      alert(`Campaign launched! ${data.scheduled} emails scheduled.`);
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="text-xs text-gray-500 mb-2">Step 4 of 4</div>
        <h1 className="text-2xl font-semibold mb-2">
          Start Your First SmartSend Campaign
        </h1>
        <p className="text-sm text-gray-600">
          Everything is pre-filled. Just click launch and you&apos;re live!
        </p>
      </div>

      <form onSubmit={handleLaunch} className="space-y-6">
        <div className="border rounded-lg p-6 bg-gray-50 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Campaign Name
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Target List
            </label>
            <select
              value={listId || ""}
              onChange={(e) => setListId(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-black focus:border-transparent"
            >
              {availableLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Template:</span>
              <span className="font-medium">SmartSend Roofing – Reactivation v1</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Schedule:</span>
              <span className="font-medium">Day 0, 2, 4</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Status:</span>
              <span className="font-medium text-green-600">Ready to Launch</span>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-blue-50">
          <p className="text-sm text-blue-900">
            ✅ <strong>Pre-filled defaults:</strong> No campaign copy writing required, no advanced list logic, no schedule decisions. Just click launch!
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push("/onboarding/step-3-contacts")}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading || !listId}
            className="px-8 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? "Launching..." : "🚀 Launch My Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}























































