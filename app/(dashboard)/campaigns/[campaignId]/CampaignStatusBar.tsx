// app/(dashboard)/campaigns/[campaignId]/CampaignStatusBar.tsx
"use client";

import { useState } from "react";

type CampaignStatus = "draft" | "active" | "paused" | "queued";

interface CampaignStatusBarProps {
  campaignId: string;
  initialStatus: CampaignStatus;
  createdAt: string;
}

export function CampaignStatusBar({
  campaignId,
  initialStatus,
  createdAt,
}: CampaignStatusBarProps) {
  const [status, setStatus] = useState<CampaignStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function updateStatus(next: CampaignStatus) {
    if (next === status) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update campaign");
      }

      setStatus(next);
      setMessage("Updated");
      setTimeout(() => setMessage(null), 1500);
    } catch (err: any) {
      console.error("Status update error:", err);
      setMessage(err.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  const statusOptions: CampaignStatus[] = ["draft", "active", "paused"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="uppercase tracking-wide text-neutral-500">
            Status
          </span>
          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-100">
            {status}
          </span>
          {message && (
            <span className="text-[0.7rem] text-neutral-400">
              {message}
            </span>
          )}
        </div>
        <span className="text-[0.7rem] text-neutral-500">
          Created {new Date(createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {statusOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={saving}
            onClick={() => updateStatus(opt)}
            className={`rounded-full px-3 py-1 ${
              status === opt
                ? "bg-neutral-100 text-neutral-900"
                : "border border-neutral-700 text-neutral-200"
            }`}
          >
            {opt === "draft"
              ? "Draft"
              : opt === "active"
              ? "Active"
              : "Paused"}
          </button>
        ))}
      </div>
    </div>
  );
}

