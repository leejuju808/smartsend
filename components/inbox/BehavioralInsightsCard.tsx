// Block 20310 — Behavioral Insight Chips Card

"use client";

import { useEffect, useState } from "react";

type Insight = {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  group?: "engagement" | "timing" | "pricing" | "insurance" | "job";
};

interface BehavioralInsightsCardProps {
  conversationId: string;
}

export function BehavioralInsightsCard({
  conversationId,
}: BehavioralInsightsCardProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const url = `/api/inbox/behavioral-insights?conversation_id=${conversationId}`;
      const res = await fetch(url);
      const json = await res.json();
      setInsights(json.insights ?? []);
    } catch (err) {
      console.error("Behavioral insights load error", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  if (!loading && insights.length === 0) {
    return null;
  }

  function chipClasses(severity: string): string {
    switch (severity) {
      case "high":
        return "bg-red-50 text-red-700 border-red-200";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  }

  return (
    <div className="mt-2 mb-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-700">
          Behavioral insights
        </p>
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-gray-400 underline"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {insights.map((ins) => (
          <span
            key={ins.key}
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] ${chipClasses(
              ins.severity
            )}`}
          >
            {ins.label}
          </span>
        ))}
      </div>
    </div>
  );
}

















































