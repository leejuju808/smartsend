// Block 22085 — Smart Pipeline Board v2: Job Card Component
// The Revenue Card v2 — displays all intelligence metrics

"use client";

import { PipelineJob } from "./SmartPipelineBoard";
import { JobHealthBadge } from "@/components/JobHealthBadge";
import { WinProbabilityBadge } from "@/components/WinProbabilityBadge";
import { FinancingStatusBadge } from "@/components/financing/FinancingStatusBadge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Brain, AlertTriangle } from "lucide-react";

interface JobCardProps {
  job: PipelineJob;
  onClick: () => void;
}

export function JobCard({ job, onClick }: JobCardProps) {
  // Determine health color and border
  const healthColor =
    job.job_health_score >= 75
      ? "border-green-500/50"
      : job.job_health_score >= 50
      ? "border-yellow-500/50"
      : "border-red-500/50";

  // Pulsing red glow for Job Save active
  const isInSaveMode = job.is_in_save_mode;
  const saveModeClasses = isInSaveMode
    ? "animate-pulse ring-2 ring-red-500/50 shadow-lg shadow-red-500/30"
    : "";

  // Risk color mapping
  const riskColors = {
    none: "text-green-300",
    low: "text-green-300",
    medium: "text-yellow-300",
    high: "text-red-400",
    critical: "text-red-600 font-bold",
  };

  const riskColor = riskColors[job.risk_category] || "text-gray-400";

  return (
    <div
      className={cn(
        "p-4 rounded-xl bg-white/5 border cursor-pointer hover:bg-white/10 transition-all",
        healthColor,
        saveModeClasses
      )}
      onClick={onClick}
    >
      {/* WIN PROBABILITY BADGE — Top of Card (Block 22192) */}
      {(job.win_probability !== null && job.win_probability !== undefined) && (
        <div className="mb-3 flex justify-center">
          <WinProbabilityBadge
            probability={job.win_probability}
            variant="card"
            showLabel={true}
          />
        </div>
      )}

      {/* TOP SECTION */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white text-sm truncate">
            {job.homeowner_name}
          </div>
          <div className="text-xs text-gray-400 truncate">
            {job.address || job.email}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 ml-2">
          <span className="text-xs bg-black/40 px-2 py-1 rounded text-gray-300 whitespace-nowrap">
            Job Source: {job.job_source_primary}
          </span>
          {job.job_source_secondary && (
            <span className="text-[10px] text-gray-500 truncate max-w-[160px]">
              {job.job_source_secondary}
            </span>
          )}
          {job.estimator_name && (
            <span className="text-[10px] text-gray-500">
              {job.estimator_name}
            </span>
          )}
        </div>
      </div>

      {/* MIDDLE SECTION — INTELLIGENCE METRICS */}
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        <Metric
          label="❤️ Health"
          value={job.job_health_score}
          color={
            job.job_health_score >= 75
              ? "text-green-400"
              : job.job_health_score >= 50
              ? "text-yellow-400"
              : "text-red-400"
          }
        />
        <Metric
          label="📈 Momentum"
          value={job.momentum_score}
          color="text-blue-400"
        />
        <Metric
          label="🙂 Exp"
          value={job.experience_score}
          color={
            job.experience_score >= 85
              ? "text-green-400"
              : job.experience_score >= 60
              ? "text-yellow-400"
              : job.experience_score >= 40
              ? "text-orange-400"
              : job.experience_score >= 20
              ? "text-red-400"
              : "text-red-600"
          }
          trend={job.experience_score_trend}
        />
        <Metric
          label="⚠️ Risk"
          value={job.risk_category}
          color={riskColor}
          isText={true}
        />
      </div>

      {/* SIDE BADGE — Health Indicator Strip */}
      <div
        className={cn(
          "h-1 rounded-full mb-3",
          job.job_health_score >= 75
            ? "bg-green-500"
            : job.job_health_score >= 50
            ? "bg-yellow-500"
            : "bg-red-500"
        )}
      />

      {/* FINANCING STATUS - Block 36555 */}
      {job.financing_status && (
        <div className="mb-3 flex justify-start">
          <FinancingStatusBadge status={job.financing_status} variant="compact" />
        </div>
      )}

      {/* BOTTOM SECTION */}
      <div className="flex justify-between items-center text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-gray-400">Value</span>
          <span className="text-green-400 font-semibold">
            {formatCurrency(job.estimated_value)}
          </span>
        </div>
        {/* Show win_probability if available, otherwise fallback to probability */}
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-gray-400">Win Prob</span>
          <span className="text-blue-400 font-semibold">
            {(job.win_probability !== null && job.win_probability !== undefined)
              ? `${job.win_probability}%`
              : job.probability !== null && job.probability !== undefined
              ? `${job.probability}%`
              : "--"}
          </span>
        </div>
      </div>

      {/* Days in Stage & Last Contact */}
      <div className="flex justify-between items-center mt-2 text-[10px] text-gray-500">
        <span>
          {job.days_in_stage > 0
            ? `${job.days_in_stage}d in stage`
            : "Just started"}
        </span>
        {job.days_since_last_contact !== null && (
          <span>
            {job.days_since_last_contact === 0
              ? "Contacted today"
              : `${job.days_since_last_contact}d since contact`}
          </span>
        )}
      </div>

      {/* JOB SAVE MODE INDICATOR */}
      {isInSaveMode && (
        <div className="mt-3 pt-2 border-t border-red-500/30">
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
            <AlertTriangle className="h-3 w-3" />
            <span>⚠️ SAVE THIS JOB</span>
          </div>
        </div>
      )}

      {/* AI INSIGHT INDICATOR (Optional - can be enhanced later) */}
      {job.job_health_score >= 75 && job.probability >= 70 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-400">
          <Brain className="h-3 w-3" />
          <span className="opacity-75">AI Insight Available</span>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  color,
  isText = false,
  trend,
}: {
  label: string;
  value: number | string;
  color: string;
  isText?: boolean;
  trend?: number | null;
}) {
  // Get colored dot for experience score
  const getDot = () => {
    if (typeof value !== "number") return null;
    if (value >= 85) return "🟢";
    if (value >= 60) return "🟡";
    if (value >= 40) return "🟠";
    if (value >= 20) return "🔴";
    return "⚫";
  };

  // Get trend arrow
  const getTrendArrow = () => {
    if (trend === null || trend === undefined) return null;
    if (trend > 0) return <span className="text-green-300 text-xs">↑</span>;
    if (trend < 0) return <span className="text-red-300 text-xs">↓</span>;
    return <span className="text-gray-300 text-xs">→</span>;
  };

  const dot = getDot();
  const trendArrow = getTrendArrow();

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-gray-400 mb-0.5">{label}</span>
      <div className="flex items-center gap-1">
        {dot && <span className="text-xs">{dot}</span>}
        <span className={cn("text-sm font-semibold", color)}>
          {isText ? String(value).toUpperCase() : value}
        </span>
        {trendArrow}
      </div>
    </div>
  );
}

