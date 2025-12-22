// Block 20320 — Engagement Heat Meter

"use client";

import { useState, useEffect } from "react";

interface EngagementHeatCardProps {
  score: number | null;
  level: "cold" | "warm" | "hot" | null;
  conversationId?: string;
  onUpdated?: (patch: any) => void;
}

export function EngagementHeatCard({
  score,
  level,
  conversationId,
  onUpdated,
}: EngagementHeatCardProps) {
  const [loading, setLoading] = useState(false);
  const [localScore, setLocalScore] = useState(score);
  const [localLevel, setLocalLevel] = useState(level);

  // Sync local state when props change
  useEffect(() => {
    setLocalScore(score);
    setLocalLevel(level);
  }, [score, level]);

  async function refresh() {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/engagement-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      const json = await res.json();
      setLoading(false);

      if (json.conversation) {
        setLocalScore(json.engagement_score);
        setLocalLevel(json.engagement_level);
        if (onUpdated) onUpdated(json.conversation);
      }
    } catch (err) {
      console.error("Engagement refresh error", err);
      setLoading(false);
    }
  }

  const coldActive = localLevel === "cold";
  const warmActive = localLevel === "warm";
  const hotActive = localLevel === "hot";

  return (
    <div className="mt-2 mb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-700">
          Engagement heat
        </p>

        {conversationId && (
          <button
            onClick={refresh}
            className="text-[10px] text-gray-400 underline"
            type="button"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <div className="flex gap-1 w-full h-2 rounded overflow-hidden">
        <div
          className={`flex-1 ${
            coldActive ? "bg-slate-400" : "bg-slate-200"
          }`}
        ></div>
        <div
          className={`flex-1 ${
            warmActive ? "bg-amber-400" : "bg-amber-200"
          }`}
        ></div>
        <div
          className={`flex-1 ${
            hotActive ? "bg-red-500" : "bg-red-200"
          }`}
        ></div>
      </div>

      <p className="text-[10px] text-gray-500 mt-1">
        {localLevel
          ? `${localLevel.toUpperCase()} · ${localScore ?? 0} pts`
          : "No engagement data yet"}
      </p>
    </div>
  );
}

