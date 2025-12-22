"use client";
import { useState } from "react";

export function GenerateDraftsButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    setCount(null);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, limit: 25 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setCount(json.created);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={run}
      className="px-4 py-2 rounded-2xl bg-yellow-400/90 hover:bg-yellow-400 text-black font-semibold disabled:opacity-60"
      disabled={loading}
    >
      {loading ? "Generating…" : "Generate AI Drafts"}
      {count !== null && <span className="ml-2 text-xs">({count} created)</span>}
    </button>
  );
}