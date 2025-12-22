"use client";

// Block 22029 — SmartSend Roofing Estimator Scorecard v1
// Daily Coaching Dashboard for Each Estimator — Built to Move Revenue

import { cn } from "@/lib/utils";
import { JobHealthBadge } from "@/components/JobHealthBadge";

export type EstimatorScorecardData = {
  scorecard: {
    workspace_id: string;
    estimator_id: string;
    estimator_name: string;
    performance_score: number | null;
    speed_score: number | null;
    followup_score: number | null;
    proposal_score: number | null;
    close_rate_score: number | null;
    tone_score: number | null;
    ai_alignment_score: number | null;
    active_jobs: number;
    active_pipeline_value: number;
    avg_active_job_health: number;
    jobs_won_30d: number;
    revenue_won_30d: number;
    jobs_lost_30d: number;
    close_rate_30d: number;
  };
  jobs: {
    healthy: Array<{
      id: string;
      homeowner_name: string;
      status: string;
      job_health_score: number | null;
      job_health_trend: string | null;
      estimated_value: number;
      momentum_score: number | null;
      homeowner_experience_score: number | null;
      risk_category: string | null;
    }>;
    watchlist: Array<{
      id: string;
      homeowner_name: string;
      status: string;
      job_health_score: number | null;
      job_health_trend: string | null;
      estimated_value: number;
      momentum_score: number | null;
      homeowner_experience_score: number | null;
      risk_category: string | null;
    }>;
    atRisk: Array<{
      id: string;
      homeowner_name: string;
      status: string;
      job_health_score: number | null;
      job_health_trend: string | null;
      estimated_value: number;
      momentum_score: number | null;
      homeowner_experience_score: number | null;
      risk_category: string | null;
    }>;
  };
  reasons: {
    wins: Array<{ reason: string; count: number }>;
    losses: Array<{ reason: string; count: number }>;
  };
};

type EstimatorScorecardPageProps = {
  data: EstimatorScorecardData;
};

export function EstimatorScorecardPage({ data }: EstimatorScorecardPageProps) {
  const { scorecard, jobs, reasons } = data;

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{scorecard.estimator_name}</h1>
          <p className="text-sm text-gray-400">
            Estimator Scorecard — updated daily
          </p>
        </div>

        <div className="flex items-end gap-6">
          <div className="text-right">
            <div className="text-xs text-gray-400">Performance Score</div>
            <div className="text-4xl font-extrabold text-green-400">
              {scorecard.performance_score ?? "--"}
            </div>
          </div>

          <div className="text-right text-sm text-gray-300">
            <div>
              Active Jobs:{" "}
              <span className="font-semibold">{scorecard.active_jobs}</span>
            </div>
            <div>
              Active Pipeline:{" "}
              <span className="font-semibold">
                ${scorecard.active_pipeline_value.toLocaleString()}
              </span>
            </div>
            <div>
              Close Rate (30d):{" "}
              <span className="font-semibold">
                {scorecard.close_rate_30d.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* METRIC GRID + JOB HEALTH SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: metric breakdown */}
        <div className="lg:col-span-1 space-y-3">
          <MetricCard label="Speed to Lead" value={scorecard.speed_score} />
          <MetricCard
            label="Follow-Up Quality"
            value={scorecard.followup_score}
          />
          <MetricCard label="Proposal Speed" value={scorecard.proposal_score} />
          <MetricCard
            label="Close Rate Quality"
            value={scorecard.close_rate_score}
          />
          <MetricCard
            label="Tone & Communication"
            value={scorecard.tone_score}
          />
          <MetricCard label="AI Alignment" value={scorecard.ai_alignment_score} />
        </div>

        {/* Middle/Right: jobs grouped by health */}
        <div className="lg:col-span-2 space-y-4">
          <JobsByHealthSection jobs={jobs} />
        </div>
      </div>

      {/* WIN/LOSS REASONS + ACTION COACHING */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <WinLossReasons wins={reasons.wins} losses={reasons.losses} />
        <TodayCoachingPanel scorecard={scorecard} jobs={jobs} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  const displayValue = value != null ? value : "--";
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center">
      <span className="text-sm text-gray-300">{label}</span>
      <span className="text-lg font-semibold">{displayValue}</span>
    </div>
  );
}

function JobsByHealthSection({
  jobs,
}: {
  jobs: EstimatorScorecardData["jobs"];
}) {
  const Pill = ({
    title,
    count,
    color,
  }: {
    title: string;
    count: number;
    color: string;
  }) => (
    <div className={cn("px-3 py-1 rounded-full text-xs", color)}>
      {title}: {count}
    </div>
  );

  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Jobs by Health</h2>
        <div className="flex gap-2 text-xs">
          <Pill
            title="Healthy"
            count={jobs.healthy.length}
            color="bg-green-500/20 text-green-300"
          />
          <Pill
            title="Watchlist"
            count={jobs.watchlist.length}
            color="bg-yellow-500/20 text-yellow-300"
          />
          <Pill
            title="At Risk"
            count={jobs.atRisk.length}
            color="bg-red-500/20 text-red-300"
          />
        </div>
      </div>

      <JobList title="🚨 At-Risk Jobs" items={jobs.atRisk} emphasis />
      <JobList title="⚠️ Watchlist" items={jobs.watchlist} />
      <JobList title="✅ Healthy Jobs" items={jobs.healthy} />
    </div>
  );
}

function JobList({
  title,
  items,
  emphasis,
}: {
  title: string;
  items: EstimatorScorecardData["jobs"]["healthy"];
  emphasis?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{title}</div>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {items.map((job) => (
          <div
            key={job.id}
            className={cn(
              "flex justify-between text-xs p-2 rounded-lg border",
              emphasis
                ? "border-red-400/40 bg-red-500/5"
                : "border-white/10 bg-black/20"
            )}
          >
            <div className="flex flex-col">
              <span className="font-semibold">
                {job.homeowner_name || "Homeowner"}
              </span>
              <span className="text-gray-400">
                Health {job.job_health_score ?? "--"} · Momentum{" "}
                {job.momentum_score ?? "--"} · Exp{" "}
                {job.homeowner_experience_score ?? "--"}
              </span>
            </div>
            <div className="text-right">
              <div className="font-semibold">
                ${job.estimated_value.toLocaleString()}
              </div>
              <div className="text-gray-400 text-[10px] capitalize">
                {job.status} · {job.risk_category || "no risk"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WinLossReasons({
  wins,
  losses,
}: {
  wins: Array<{ reason: string; count: number }>;
  losses: Array<{ reason: string; count: number }>;
}) {
  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-4">
      <h2 className="text-lg font-semibold">Why They Win & Lose</h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-semibold text-green-300 mb-1">
            Top Win Reasons
          </div>
          {wins.length === 0 && (
            <div className="text-gray-500">No data yet.</div>
          )}
          {wins.map((w) => (
            <div key={w.reason} className="text-gray-200">
              • {w.reason}{" "}
              <span className="text-gray-500">({w.count})</span>
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold text-red-300 mb-1">
            Top Loss Reasons
          </div>
          {losses.length === 0 && (
            <div className="text-gray-500">No data yet.</div>
          )}
          {losses.map((l) => (
            <div key={l.reason} className="text-gray-200">
              • {l.reason}{" "}
              <span className="text-gray-500">({l.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TodayCoachingPanel({
  scorecard,
  jobs,
}: {
  scorecard: EstimatorScorecardData["scorecard"];
  jobs: EstimatorScorecardData["jobs"];
}) {
  // Simple V1 coaching: highlight one strength & 1–2 fixes
  const suggestions: string[] = [];

  if ((scorecard.followup_score ?? 0) < 70) {
    suggestions.push(
      "Tighten follow-ups: complete all 'follow up hot' tasks in your Action Queue before noon."
    );
  }
  if ((scorecard.proposal_score ?? 0) < 70) {
    suggestions.push(
      "Speed up proposals: aim to send all proposals same day the estimate is completed."
    );
  }
  if ((scorecard.speed_score ?? 0) < 70) {
    suggestions.push(
      "Respond to new leads faster: target under 10 minutes response time."
    );
  }
  if (jobs.atRisk.length > 0) {
    suggestions.push(
      `You have ${jobs.atRisk.length} at-risk jobs. Call those homeowners today and repair the relationship.`
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Keep doing what you're doing. Focus on high-health jobs close to closing and protect your watchlist jobs."
    );
  }

  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
      <h2 className="text-lg font-semibold">Today's Coaching Focus</h2>
      <ul className="list-disc pl-5 text-sm text-gray-200 space-y-1">
        {suggestions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}









































