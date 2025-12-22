// components/dashboard/HotJobsList.tsx
// Block 21582: Hot Jobs Focus List Component
// Displays prioritized list of jobs that need action today

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type HotJob = {
  lead_id: string;
  workspace_id: string;
  user_id: string | null;
  first_name: string | null;
  email: string;
  pipeline_stage: string;
  job_health_score: number | null;
  last_intent: string | null;
  last_reply_at: string | null;
  estimated_value: number;
  priority_rank: number;
};

export default function HotJobsList() {
  const [jobs, setJobs] = useState<HotJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/focus-list")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load focus list:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold mb-3">
          🔥 Top Jobs That Need Action Today
        </h2>
        <div className="text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!jobs.length) {
    return null;
  }

  const formatPipelineStage = (stage: string) => {
    return stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getHealthScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-500";
    if (score < 40) return "text-red-600 font-semibold";
    if (score < 60) return "text-yellow-600";
    return "text-green-600";
  };

  const getIntentLabel = (intent: string | null) => {
    if (!intent) return "No intent";
    switch (intent) {
      case "hot_lead":
        return "🔥 Hot";
      case "warm_lead":
        return "🟡 Warm";
      case "question":
        return "❓ Question";
      case "not_interested":
        return "❌ Not Interested";
      default:
        return intent.replace(/_/g, " ");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-6">
      <h2 className="text-lg font-semibold mb-3">
        🔥 Top Jobs That Need Action Today
      </h2>

      <div className="space-y-3">
        {jobs.map((item) => (
          <Link
            key={item.lead_id}
            href={`/leads/${item.lead_id}`}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-gray-900">
                {item.first_name || "Homeowner"}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatPipelineStage(item.pipeline_stage)} ·{" "}
                {getIntentLabel(item.last_intent)}
              </div>
            </div>

            <div className="text-right ml-4">
              <div className="text-sm font-semibold text-gray-900">
                ${item.estimated_value?.toLocaleString() || "0"}
              </div>
              <div
                className={`text-xs ${getHealthScoreColor(item.job_health_score)}`}
              >
                Health: {Math.round(item.job_health_score || 0)}/100
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}














































