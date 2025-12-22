// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Job Profit Cards Component
// Shows revenue, actual profit, margin %, and health score for each job

"use client";

import { useState } from "react";
import Link from "next/link";

interface JobProfitCard {
  id: string;
  revenue: number;
  actual_profit: number;
  margin_percent: number;
  health_score: number;
  variance: number;
  jobs: {
    id: string;
    contract_value: number;
    stage: string;
    created_at: string;
  } | null;
}

export function JobProfitCards({ jobs }: { jobs: JobProfitCard[] }) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-400";
    if (score >= 75) return "text-green-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const getHealthScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Solid";
    if (score >= 60) return "Needs Improvement";
    return "Red Flag";
  };

  const getMarginColor = (margin: number) => {
    if (margin >= 40) return "text-emerald-400";
    if (margin >= 35) return "text-green-400";
    if (margin >= 30) return "text-amber-400";
    return "text-red-400";
  };

  if (jobs.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Job Profit Cards
        </h2>
        <div className="text-sm text-zinc-400">No jobs with profit data yet.</div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
      <h2 className="text-lg font-semibold text-zinc-100 mb-4">
        Job Profit Cards
      </h2>
      <div className="space-y-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 hover:border-zinc-600 transition-colors cursor-pointer"
            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Link
                    href={`/dashboard/jobs/${job.jobs?.id || job.id}`}
                    className="text-sm font-medium text-zinc-100 hover:text-blue-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Job {job.jobs?.id?.slice(0, 8) || job.id.slice(0, 8)}
                  </Link>
                  <span className="text-xs px-2 py-0.5 bg-zinc-700 rounded text-zinc-300">
                    {job.jobs?.stage || "unknown"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Revenue</div>
                    <div className="text-zinc-100 font-medium">
                      ${(job.revenue || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Actual Profit</div>
                    <div className={`font-medium ${
                      (job.actual_profit || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      ${(job.actual_profit || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Margin %</div>
                    <div className={`font-medium ${getMarginColor(job.margin_percent || 0)}`}>
                      {(job.margin_percent || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Health Score</div>
                    <div className={`font-medium ${getHealthScoreColor(job.health_score || 0)}`}>
                      {job.health_score || 0} - {getHealthScoreLabel(job.health_score || 0)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {expandedJob === job.id && (
              <div className="mt-4 pt-4 border-t border-zinc-700">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Variance</div>
                    <div className={`font-medium ${
                      (job.variance || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      ${(job.variance || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-400 mb-1">Created</div>
                    <div className="text-zinc-300">
                      {job.jobs?.created_at
                        ? new Date(job.jobs.created_at).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}





























