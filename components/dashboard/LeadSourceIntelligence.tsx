"use client";

import { useEffect, useState } from "react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

type LeadSourceStat = {
  id: string;
  workspace_id: string;
  source: string;
  total_leads: number;
  avg_heat: number | null;
  avg_probability: number | null;
  close_rate: number | null;
  avg_job_value: number | null;
  total_revenue: number | null;
  source_score: number | null;
  updated_at: string;
};

export function LeadSourceIntelligence() {
  const { workspace } = useCurrentWorkspace();
  const [stats, setStats] = useState<LeadSourceStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace?.id) return;

    setLoading(true);
    fetch(`/api/lead-source/stats?workspace_id=${workspace.id}`)
      .then((r) => r.json())
      .then((res) => {
        setStats(res.stats || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching lead source stats:", err);
        setLoading(false);
      });
  }, [workspace?.id]);

  if (loading) {
    return (
      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
        <h2 className="text-xl font-bold">Lead Source Intelligence</h2>
        <p className="text-sm text-gray-400">Loading source performance data...</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
        <h2 className="text-xl font-bold">Lead Source Intelligence</h2>
        <p className="text-sm text-gray-400">
          No lead source data yet. Sources will be automatically detected as leads come in.
        </p>
      </div>
    );
  }

  // Sort by source_score descending
  const sortedStats = [...stats].sort((a, b) => {
    const scoreA = a.source_score ?? 0;
    const scoreB = b.source_score ?? 0;
    return scoreB - scoreA;
  });

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Lead Source Intelligence</h2>
        <p className="text-sm text-gray-400">
          Which sources bring you real revenue.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedStats.map((stat) => (
          <SourceCard key={stat.id} stat={stat} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ stat }: { stat: LeadSourceStat }) {
  const sourceName = formatSourceName(stat.source);
  const score = stat.source_score ?? 0;
  const scoreLabel = getScoreLabel(score);
  const scoreColor = getScoreColor(score);

  return (
    <div className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <span className="font-semibold capitalize text-sm">{sourceName}</span>
          <div className="text-xs text-gray-400 mt-0.5">
            {stat.total_leads} lead{stat.total_leads !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${scoreColor}`}>{score}</div>
          <div className="text-[10px] text-gray-400">{scoreLabel}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mt-2 pt-2 border-t border-white/10">
        <div>
          <div className="text-gray-400">Close Rate</div>
          <div className="font-semibold text-gray-200">
            {stat.close_rate !== null ? `${stat.close_rate.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Avg Job Value</div>
          <div className="font-semibold text-gray-200">
            {stat.avg_job_value !== null
              ? `$${Math.round(stat.avg_job_value).toLocaleString()}`
              : "—"}
          </div>
        </div>
        {stat.total_revenue !== null && stat.total_revenue > 0 && (
          <div className="col-span-2 pt-1">
            <div className="text-gray-400">Total Revenue</div>
            <div className="font-semibold text-yellow-300">
              ${Math.round(stat.total_revenue).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSourceName(source: string): string {
  const sourceMap: Record<string, string> = {
    google_search: "Google Search",
    google_ads: "Google Ads",
    facebook_ads: "Facebook Ads",
    homeadvisor: "HomeAdvisor",
    angi: "Angi",
    thumbtack: "Thumbtack",
    yard_sign: "Yard Sign",
    door_hanger: "Door Hanger",
    referral: "Referral",
    real_estate_agent: "Real Estate Agent",
    insurance_adjuster: "Insurance Adjuster",
    walk_in: "Walk-In",
    event: "Event/Expo",
    cold_email: "Cold Email",
    resurrection: "Resurrection",
    unknown: "Unknown",
  };

  return sourceMap[source] || source.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "🔥 Top Performer";
  if (score >= 60) return "👍 Solid Source";
  if (score >= 40) return "⚠️ Low Quality";
  return "🚫 Waste of Money";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-yellow-300";
  if (score >= 60) return "text-green-300";
  if (score >= 40) return "text-orange-300";
  return "text-red-300";
}









































