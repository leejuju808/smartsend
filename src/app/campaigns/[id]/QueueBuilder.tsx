// /app/campaigns/[id]/QueueBuilder.tsx
"use client";
import { useState } from "react";

export function QueueBuilder({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ enqueued?: number; error?: string } | null>(null);

  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-medium">Send Queue</h3>
      <p className="text-sm text-gray-500">Render templates, enforce limits, and schedule sends.</p>
      <button
        className="mt-3 rounded-lg border px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60"
        onClick={async () => {
          setLoading(true);
          setResult(null);
          const r = await fetch(`/api/campaigns/${campaignId}/queue`, { method: "POST" });
          const j = await r.json();
          setResult(j.success ? { enqueued: j.enqueued } : { error: j.error });
          setLoading(false);
        }}
        disabled={loading}
      >
        {loading ? "Building…" : "Build Queue"}
      </button>

      {result?.enqueued != null && (
        <p className="mt-2 text-sm text-emerald-700">✅ Enqueued {result.enqueued} emails.</p>
      )}
      {result?.error && <p className="mt-2 text-sm text-rose-700">❌ {result.error}</p>}
    </div>
  );
}