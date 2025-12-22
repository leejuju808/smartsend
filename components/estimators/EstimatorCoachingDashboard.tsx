"use client";

// Block 22158 — SmartSend Roofing "Estimator Coaching Engine v1"
// Owner View: Coaching Dashboard showing all estimators with AI coaching insights

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

export type EstimatorCoachingData = {
  estimator_id: string;
  estimator_name: string;
  performance_score: number | null;
  rank: number;
  revenue_won_30d: number;
  close_rate_30d: number;
  active_jobs: number;
  latest_coaching: {
    id: string;
    report_type: "daily" | "weekly";
    top_priority: string | null;
    strengths_data: string[] | null;
    weaknesses_data: string[] | null;
    recommendations: string[] | null;
    week_end: string;
  } | null;
};

type EstimatorCoachingDashboardProps = {
  workspaceId: string;
  initialData?: EstimatorCoachingData[];
};

export function EstimatorCoachingDashboard({
  workspaceId,
  initialData = [],
}: EstimatorCoachingDashboardProps) {
  const [data, setData] = useState<EstimatorCoachingData[]>(initialData);
  const [loading, setLoading] = useState(!initialData.length);

  useEffect(() => {
    if (!initialData.length) {
      fetchCoachingData();
    }
  }, [workspaceId]);

  const fetchCoachingData = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/estimators/coaching-dashboard?workspace_id=${workspaceId}`
      );
      if (response.ok) {
        const result = await response.json();
        setData(result.estimators || []);
      }
    } catch (error) {
      console.error("Error fetching coaching data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-gray-400">
        Loading coaching data...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-gray-400">
        No estimators found. Assign leads to estimators to see coaching insights.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">🧠 Estimator Coaching Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            AI-powered coaching insights for every estimator. See strengths, weaknesses, and actionable recommendations.
          </p>
        </div>
      </div>

      {/* COACHING CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.map((estimator) => (
          <EstimatorCoachingCard key={estimator.estimator_id} estimator={estimator} />
        ))}
      </div>
    </div>
  );
}

function EstimatorCoachingCard({ estimator }: { estimator: EstimatorCoachingData }) {
  const coaching = estimator.latest_coaching;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Link
              href={`/estimators/${estimator.estimator_id}/coaching`}
              className="text-lg font-semibold hover:text-blue-400 transition-colors"
            >
              {estimator.estimator_name}
            </Link>
            <span className="text-xs text-gray-400">#{estimator.rank}</span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
            <span>
              Score:{" "}
              <span
                className={cn(
                  "font-semibold",
                  estimator.performance_score != null && estimator.performance_score >= 80
                    ? "text-green-400"
                    : estimator.performance_score != null && estimator.performance_score >= 60
                    ? "text-yellow-400"
                    : "text-gray-400"
                )}
              >
                {estimator.performance_score ?? "N/A"}
              </span>
            </span>
            <span>•</span>
            <span className="text-green-400">
              ${formatCurrency(estimator.revenue_won_30d)} (30d)
            </span>
            <span>•</span>
            <span
              className={cn(
                estimator.close_rate_30d >= 30
                  ? "text-green-400"
                  : estimator.close_rate_30d >= 20
                  ? "text-yellow-400"
                  : "text-red-400"
              )}
            >
              {Math.round(estimator.close_rate_30d)}% close rate
            </span>
          </div>
        </div>
      </div>

      {coaching ? (
        <>
          {/* TOP PRIORITY */}
          {coaching.top_priority && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="text-xs font-semibold text-blue-400 mb-1">🎯 TOP PRIORITY</div>
              <p className="text-sm text-gray-200">{coaching.top_priority}</p>
            </div>
          )}

          {/* STRENGTHS */}
          {coaching.strengths_data && coaching.strengths_data.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-green-400 mb-2">📈 STRENGTHS</div>
              <ul className="space-y-1">
                {coaching.strengths_data.slice(0, 3).map((strength, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* WEAKNESSES */}
          {coaching.weaknesses_data && coaching.weaknesses_data.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-orange-400 mb-2">📉 AREAS FOR IMPROVEMENT</div>
              <ul className="space-y-1">
                {coaching.weaknesses_data.slice(0, 3).map((weakness, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-orange-400 mt-1">⚠</span>
                    <span>{weakness}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* RECOMMENDATIONS */}
          {coaching.recommendations && coaching.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-blue-400 mb-2">💡 RECOMMENDATIONS</div>
              <ul className="space-y-1">
                {coaching.recommendations.slice(0, 2).map((rec, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-blue-400 mt-1">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-xs text-gray-500 pt-2 border-t border-white/10">
            {coaching.report_type === "weekly" ? "Weekly" : "Daily"} coaching report •{" "}
            {new Date(coaching.week_end).toLocaleDateString()}
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-400 text-center py-4">
          No coaching report available yet. Reports are generated {estimator.performance_score ? "weekly" : "daily"}.
        </div>
      )}

      {/* VIEW FULL REPORT LINK */}
      <Link
        href={`/estimators/${estimator.estimator_id}/coaching`}
        className="block text-center text-sm text-blue-400 hover:text-blue-300 transition-colors pt-2 border-t border-white/10"
      >
        View Full Coaching Report →
      </Link>
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









































