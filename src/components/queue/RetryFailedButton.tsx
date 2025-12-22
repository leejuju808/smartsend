"use client";
import React, { useState } from "react";

export default function RetryFailedButton({
  campaignId,
  selectedLeadIds, // optional array<string>
  onDone, // optional callback to refetch dashboard/queue
}: {
  campaignId: string;
  selectedLeadIds?: string[];
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setMsg(null);
    try {
      const resp = await fetch("/api/queue/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          lead_ids: selectedLeadIds, // optional
          limit: 500, // cap retries
          stagger_seconds: 1, // quick re-queue cadence
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.ok)
        throw new Error(json.error || "Retry failed");
      setMsg(`Re-queued ${json.requeued} item(s).`);
      onDone?.();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
      >
        {loading ? "Retrying…" : "Retry Failed"}
      </button>
      {msg && <span className="text-sm text-gray-600">{msg}</span>}
    </div>
  );
}