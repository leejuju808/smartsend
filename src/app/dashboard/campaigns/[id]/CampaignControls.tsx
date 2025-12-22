"use client";

import { useState } from "react";

export default function CampaignControls({ id, status }: { id: string; status: string }) {
  const [pauseReason, setPauseReason] = useState<
    "deliverability_issue" | "no_leads" | "seasonal_break" | "vacation" | "other"
  >("deliverability_issue");

  const act = async (path: string, body?: any) => {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        alert(`Error: ${result.error || "Failed"}`);
        return;
      }
      location.reload();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  return (
    <div className="flex gap-2">
      {(status === "Draft" || status === "Scheduled") && (
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          onClick={() => act("/api/campaigns/start", { id })}
        >
          Start
        </button>
      )}
      {status === "Running" && (
        <>
          <select
            className="px-3 py-2 border rounded-md bg-white text-sm"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value as any)}
          >
            <option value="deliverability_issue">Deliverability issue</option>
            <option value="no_leads">No leads</option>
            <option value="seasonal_break">Seasonal break</option>
            <option value="vacation">Vacation</option>
            <option value="other">Other</option>
          </select>
          <button
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
            onClick={() => act("/api/campaigns/pause", { id, reason: pauseReason })}
          >
            Pause
          </button>
        </>
      )}
      {status === "Paused" && (
        <button
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          onClick={() => act("/api/campaigns/resume", { id })}
        >
          Resume
        </button>
      )}
      <button
        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
        onClick={() => act("/api/campaigns/stop", { id })}
      >
        Stop
      </button>
    </div>
  );
}
