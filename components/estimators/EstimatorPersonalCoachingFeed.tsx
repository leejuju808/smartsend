"use client";

// Block 22158 — SmartSend Roofing "Estimator Coaching Engine v1"
// Estimator View: Personal Improvement Feed with Weekly Coaching Report

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type PersonalCoachingReport = {
  id: string;
  report_type: "daily" | "weekly";
  week_start: string;
  week_end: string;
  top_priority: string | null;
  strengths_data: string[] | null;
  weaknesses_data: string[] | null;
  recommendations: string[] | null;
  scripts: string[] | null;
  patterns: {
    hurting: string[];
    improving: string[];
  } | null;
  insights: {
    performance_summary?: string;
    comparison?: string | null;
  } | null;
  created_at: string;
};

type EstimatorPersonalCoachingFeedProps = {
  estimatorId: string;
  workspaceId: string;
};

export function EstimatorPersonalCoachingFeed({
  estimatorId,
  workspaceId,
}: EstimatorPersonalCoachingFeedProps) {
  const [report, setReport] = useState<PersonalCoachingReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCoachingReport();
  }, [estimatorId, workspaceId]);

  const fetchCoachingReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/estimators/coaching?estimator_id=${estimatorId}&workspace_id=${workspaceId}&report_type=weekly`
      );
      if (response.ok) {
        const result = await response.json();
        setReport(result.coachingReport || null);
      }
    } catch (error) {
      console.error("Error fetching coaching report:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-gray-400">
        Loading your coaching report...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center">
        <div className="text-gray-400 mb-4">
          <div className="text-2xl mb-2">📊</div>
          <p className="text-sm">No coaching report available yet.</p>
          <p className="text-xs mt-2">
            Your weekly coaching report will appear here every Monday.
          </p>
        </div>
      </div>
    );
  }

  const periodLabel =
    report.report_type === "daily"
      ? "Today"
      : `Week of ${new Date(report.week_start).toLocaleDateString()} - ${new Date(report.week_end).toLocaleDateString()}`;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Your Weekly Coaching Report</h1>
        <p className="text-sm text-gray-400 mt-1">{periodLabel}</p>
      </div>

      {/* TOP PRIORITY */}
      {report.top_priority && (
        <div className="rounded-xl bg-blue-500/10 border-2 border-blue-500/30 p-6">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🎯</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-blue-400 mb-2">TOP PRIORITY</div>
              <p className="text-base text-gray-100 leading-relaxed">{report.top_priority}</p>
            </div>
          </div>
        </div>
      )}

      {/* PERFORMANCE SUMMARY */}
      {report.insights?.performance_summary && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-5">
          <div className="text-sm font-semibold text-gray-300 mb-2">Performance Summary</div>
          <p className="text-sm text-gray-400">{report.insights.performance_summary}</p>
          {report.insights.comparison && (
            <p className="text-sm text-gray-400 mt-2">{report.insights.comparison}</p>
          )}
        </div>
      )}

      {/* STRENGTHS */}
      {report.strengths_data && report.strengths_data.length > 0 && (
        <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📈</span>
            <h2 className="text-lg font-semibold text-green-400">Strengths</h2>
          </div>
          <ul className="space-y-3">
            {report.strengths_data.map((strength, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-green-400 mt-1 text-lg">✓</span>
                <span className="text-sm text-gray-200 flex-1">{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WEAKNESSES */}
      {report.weaknesses_data && report.weaknesses_data.length > 0 && (
        <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📉</span>
            <h2 className="text-lg font-semibold text-orange-400">Areas for Improvement</h2>
          </div>
          <ul className="space-y-3">
            {report.weaknesses_data.map((weakness, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-orange-400 mt-1 text-lg">⚠</span>
                <span className="text-sm text-gray-200 flex-1">{weakness}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* RECOMMENDATIONS */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💡</span>
            <h2 className="text-lg font-semibold text-blue-400">This Week's Recommendations</h2>
          </div>
          <ul className="space-y-3">
            {report.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-blue-400 mt-1 text-lg">→</span>
                <span className="text-sm text-gray-200 flex-1">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PATTERNS */}
      {report.patterns && (report.patterns.hurting.length > 0 || report.patterns.improving.length > 0) && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-gray-300">🧠 Performance Patterns</h2>

          {report.patterns.hurting.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-400 mb-2">Patterns Hurting Performance</div>
              <ul className="space-y-2">
                {report.patterns.hurting.map((pattern, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-red-400">✗</span>
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.patterns.improving.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-green-400 mb-2">Patterns Improving Performance</div>
              <ul className="space-y-2">
                {report.patterns.improving.map((pattern, idx) => (
                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-400">✓</span>
                    <span>{pattern}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* SUGGESTED SCRIPTS */}
      {report.scripts && report.scripts.length > 0 && (
        <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📝</span>
            <h2 className="text-lg font-semibold text-purple-400">Suggested Scripts</h2>
          </div>
          <ul className="space-y-2">
            {report.scripts.map((script, idx) => (
              <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                <span className="text-purple-400">•</span>
                <span>{script}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FOOTER */}
      <div className="text-xs text-gray-500 text-center pt-4 border-t border-white/10">
        Report generated {new Date(report.created_at).toLocaleString()}
      </div>
    </div>
  );
}









































