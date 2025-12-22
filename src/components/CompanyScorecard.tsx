"use client";

import { useEffect, useState } from "react";

interface CompanyScorecardData {
  id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  
  // Lead Flow
  leads_total: number;
  leads_answered_fast: number;
  leads_ignored: number;
  
  // Appointments
  estimates_booked: number;
  estimates_not_booked: number;
  avg_lead_to_estimate_seconds: number;
  
  // Sales Pipeline
  proposals_sent: number;
  jobs_closed: number;
  jobs_lost: number;
  win_rate: number;
  
  // Money Metrics
  job_value_created: number;
  job_value_lost: number;
  pipeline_value: number;
  
  // Follow-Up
  follow_up_completed: number;
  follow_up_missed: number;
  follow_up_rate: number;
  
  // Estimator Summary
  best_estimator_id: string | null;
  worst_estimator_id: string | null;
  estimator_team_avg: number | null;
  
  // Final Grade
  final_letter_grade: string;
  insight: string;
}

interface CompanyScorecardProps {
  workspaceId: string;
  periodStart?: string;
  periodEnd?: string;
}

function Section({ title, items }: { title: string; items: Array<[string, string | number | null | undefined]> }) {
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-3 text-gray-900">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map(([label, value]) => (
          <div className="flex justify-between items-center p-3 rounded-lg bg-gray-50" key={label}>
            <span className="text-sm text-gray-600">{label}</span>
            <span className="font-medium text-gray-900">
              {value === null || value === undefined ? "—" : value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "bg-green-500/15 text-green-700 border-green-200";
    case "B":
      return "bg-blue-500/15 text-blue-700 border-blue-200";
    case "C":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-200";
    case "D":
      return "bg-orange-500/15 text-orange-700 border-orange-200";
    case "F":
      return "bg-red-500/15 text-red-700 border-red-200";
    default:
      return "bg-gray-500/15 text-gray-700 border-gray-200";
  }
}

export function CompanyScorecard({ workspaceId, periodStart, periodEnd }: CompanyScorecardProps) {
  const [scorecard, setScorecard] = useState<CompanyScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScorecard() {
      try {
        setLoading(true);
        setError(null);

        // If period not provided, use current week
        const start = periodStart || getWeekStart();
        const end = periodEnd || getWeekEnd();

        // First, try to fetch existing scorecard
        const fetchRes = await fetch(
          `/api/company-scorecard?workspace_id=${workspaceId}&period_start=${start}&period_end=${end}`
        );

        if (fetchRes.ok) {
          const data = await fetchRes.json();
          if (data) {
            setScorecard(data);
            setLoading(false);
            return;
          }
        }

        // If no scorecard exists, compute it
        const computeRes = await fetch("/api/company-scorecard/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace_id: workspaceId,
            period_start: start,
            period_end: end,
          }),
        });

        if (!computeRes.ok) {
          throw new Error("Failed to compute scorecard");
        }

        const computed = await computeRes.json();
        setScorecard(computed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scorecard");
      } finally {
        setLoading(false);
      }
    }

    fetchScorecard();
  }, [workspaceId, periodStart, periodEnd]);

  if (loading) {
    return (
      <div className="p-6 rounded-2xl border bg-white shadow-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border bg-white shadow-lg">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="p-6 rounded-2xl border bg-white shadow-lg">
        <div className="text-gray-500">No scorecard data available</div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border bg-white shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Company Scorecard</h2>
        <div className="text-sm text-gray-500">
          {new Date(scorecard.period_start).toLocaleDateString()} -{" "}
          {new Date(scorecard.period_end).toLocaleDateString()}
        </div>
      </div>

      <Section
        title="Lead Flow"
        items={[
          ["Total Leads", scorecard.leads_total],
          ["Answered Fast (<5m)", scorecard.leads_answered_fast],
          ["Ignored", scorecard.leads_ignored],
        ]}
      />

      <Section
        title="Appointments"
        items={[
          ["Booked Estimates", scorecard.estimates_booked],
          ["Not Booked", scorecard.estimates_not_booked],
          ["Avg Lead → Estimate Time", formatDuration(scorecard.avg_lead_to_estimate_seconds)],
        ]}
      />

      <Section
        title="Sales Pipeline"
        items={[
          ["Proposals Sent", scorecard.proposals_sent],
          ["Jobs Closed", scorecard.jobs_closed],
          ["Jobs Lost", scorecard.jobs_lost],
          ["Win Rate", `${scorecard.win_rate}%`],
        ]}
      />

      <Section
        title="Money"
        items={[
          ["Job Value Created", formatCurrency(scorecard.job_value_created)],
          ["Job Value Lost", formatCurrency(scorecard.job_value_lost)],
          ["Pipeline Value", formatCurrency(scorecard.pipeline_value)],
        ]}
      />

      <Section
        title="Follow-Up"
        items={[
          ["Completed", scorecard.follow_up_completed],
          ["Missed", scorecard.follow_up_missed],
          ["Follow-Up Rate", `${scorecard.follow_up_rate}%`],
        ]}
      />

      <Section
        title="Estimator Summary"
        items={[
          ["Best Estimator", scorecard.best_estimator_id ? "ID: " + scorecard.best_estimator_id.slice(0, 8) : "—"],
          ["Worst Estimator", scorecard.worst_estimator_id ? "ID: " + scorecard.worst_estimator_id.slice(0, 8) : "—"],
          ["Team Avg Score", scorecard.estimator_team_avg?.toFixed(2) || "—"],
        ]}
      />

      <div className={`mt-6 p-5 rounded-xl border-2 ${getGradeColor(scorecard.final_letter_grade)}`}>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-2xl font-bold">Grade: {scorecard.final_letter_grade}</p>
        </div>
        <p className="text-gray-700 font-medium">{scorecard.insight}</p>
      </div>
    </div>
  );
}

// Helper functions for date calculations
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

function getWeekEnd(): string {
  const start = new Date(getWeekStart());
  start.setDate(start.getDate() + 6);
  return start.toISOString().split("T")[0];
}









































