// app/(dashboard)/campaigns/[campaignId]/CampaignEnqueueButton.tsx
"use client";

import { useState } from "react";

interface CampaignEnqueueButtonProps {
  campaignId: string;
}

export function CampaignEnqueueButton({
  campaignId,
}: CampaignEnqueueButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function queueIt() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/queue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Queue failed");
      setStatus(`Queued ${data.queued} emails.`);
    } catch (e: any) {
      console.error(e);
      setStatus(e.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {status && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 px-4 py-2 text-xs text-neutral-200">
          {status}
        </div>
      )}
      <button
        disabled={loading}
        onClick={queueIt}
        className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50"
      >
        {loading ? "Queueing…" : "Queue Campaign"}
      </button>
    </div>
  );
}

