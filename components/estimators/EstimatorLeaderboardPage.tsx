"use client";

// Block 22064 — SmartSend Roofing Estimator Leaderboard v1
// Competitive Scoreboard That Drives Revenue Every Week

import { cn } from "@/lib/utils";
import Link from "next/link";

export type EstimatorLeaderboardData = {
  workspace_id: string;
  estimator_id: string;
  estimator_name: string;
  performance_score: number | null;
  jobs_won_30d: number;
  revenue_won_30d: number;
  active_jobs: number;
  avg_active_job_health: number;
  at_risk_jobs: number;
  close_rate_30d: number;
  rank: number;
};

type EstimatorLeaderboardPageProps = {
  estimators: EstimatorLeaderboardData[];
};

export function EstimatorLeaderboardPage({
  estimators,
}: EstimatorLeaderboardPageProps) {
  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Estimator Leaderboard</h1>
          <p className="text-sm text-gray-400">
            Ranked by performance score and revenue (last 30 days).
          </p>
        </div>
        <div className="text-xs text-gray-400">
          Use this in your Monday sales meeting.
        </div>
      </div>

      {/* LEADERBOARD TABLE */}
      <LeaderboardTable estimators={estimators} />
    </div>
  );
}

function LeaderboardTable({
  estimators,
}: {
  estimators: EstimatorLeaderboardData[];
}) {
  if (!estimators || estimators.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-gray-400">
        No estimators found. Assign leads to estimators to see the leaderboard.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-white/10 text-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Rank</th>
            <th className="text-left px-4 py-3 font-semibold">Estimator</th>
            <th className="text-right px-4 py-3 font-semibold">Performance</th>
            <th className="text-right px-4 py-3 font-semibold">Jobs Won (30d)</th>
            <th className="text-right px-4 py-3 font-semibold">Revenue Won (30d)</th>
            <th className="text-right px-4 py-3 font-semibold">Close Rate (30d)</th>
            <th className="text-right px-4 py-3 font-semibold">Active Jobs</th>
            <th className="text-right px-4 py-3 font-semibold">Avg Job Health</th>
            <th className="text-right px-4 py-3 font-semibold">At-Risk Jobs</th>
          </tr>
        </thead>
        <tbody>
          {estimators.map((e, idx) => (
            <tr
              key={e.estimator_id}
              className={cn(
                "border-t border-white/10 transition-colors hover:bg-white/5",
                idx === 0
                  ? "bg-green-500/10"
                  : idx === estimators.length - 1
                  ? "bg-red-500/10"
                  : "odd:bg-white/0 even:bg-white/5"
              )}
            >
              <td className="px-4 py-3 font-semibold">
                <div className="flex items-center gap-2">
                  {idx === 0 && <span className="text-yellow-400">🏆</span>}
                  #{e.rank}
                </div>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/estimators/${e.estimator_id}/scorecard`}
                  className="flex flex-col hover:text-blue-400 transition-colors"
                >
                  <span className="font-semibold">{e.estimator_name}</span>
                  <span className="text-xs text-gray-400">
                    {e.performance_score != null
                      ? `Score ${e.performance_score}`
                      : "No score yet"}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    "font-semibold",
                    e.performance_score != null && e.performance_score >= 80
                      ? "text-green-400"
                      : e.performance_score != null && e.performance_score >= 60
                      ? "text-yellow-400"
                      : "text-gray-400"
                  )}
                >
                  {e.performance_score ?? "--"}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                {e.jobs_won_30d}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-green-400">
                ${formatCurrency(e.revenue_won_30d)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    "font-semibold",
                    e.close_rate_30d >= 30
                      ? "text-green-400"
                      : e.close_rate_30d >= 20
                      ? "text-yellow-400"
                      : "text-red-400"
                  )}
                >
                  {Math.round(e.close_rate_30d)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right">{e.active_jobs}</td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    "font-semibold",
                    e.avg_active_job_health >= 75
                      ? "text-green-400"
                      : e.avg_active_job_health >= 50
                      ? "text-yellow-400"
                      : "text-red-400"
                  )}
                >
                  {Math.round(e.avg_active_job_health)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={cn(
                    e.at_risk_jobs > 0
                      ? "text-red-400 font-semibold"
                      : "text-gray-400"
                  )}
                >
                  {e.at_risk_jobs}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}









































