// Block 22085 — Smart Pipeline Board v2: Job Detail Panel
// Right-side detail panel that opens when clicking a job card

"use client";

import { X, Phone, Mail, MapPin, User, AlertTriangle } from "lucide-react";
import { PipelineJob } from "./SmartPipelineBoard";
import { JobHealthBadge } from "@/components/JobHealthBadge";
import { JobSaveBanner } from "@/components/job-save/JobSaveBanner";
import { WinProbabilityInsight } from "@/components/WinProbabilityInsight";
import { JobTimelineV2 } from "@/components/leads/JobTimelineV2";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

function formatDistanceToNowShort(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const abs = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (abs < 60) return rtf.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffSeconds / 3600);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffSeconds / 86400);
  return rtf.format(diffDays, "day");
}

interface JobDetailPanelProps {
  job: PipelineJob;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function JobDetailPanel({
  job,
  open,
  onClose,
  onUpdate,
}: JobDetailPanelProps) {
  if (!open) return null;

  const riskColors = {
    low: "text-green-400 bg-green-500/10",
    medium: "text-yellow-400 bg-yellow-500/10",
    high: "text-red-400 bg-red-500/10",
    critical: "text-red-600 bg-red-600/20 font-bold",
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-zinc-900 border-l border-white/10 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">
            {job.homeowner_name}
          </h2>
          <p className="text-sm text-gray-400 truncate">{job.email}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 p-2 hover:bg-white/10 rounded-lg transition"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Job Save Banner */}
        {job.is_in_save_mode && (
          <JobSaveBanner leadId={job.id} />
        )}

        {/* Win Probability Insight (Block 22192) */}
        {(job.win_probability !== null && job.win_probability !== undefined) && (
          <WinProbabilityInsight
            leadId={job.id}
            probability={job.win_probability}
            reason={job.win_probability_reason}
            updatedAt={null} // Will be fetched from timeline
            nextAction={job.next_action || null}
            nextActionReason={job.next_action_reason || null}
            onRecalculate={onUpdate}
          />
        )}

        {/* Job Overview - Intelligence Metrics */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-4">
            Job Overview
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Estimated Value</div>
              <div className="text-lg font-semibold text-green-400">
                {formatCurrency(job.estimated_value)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Win Probability</div>
              <div className="text-lg font-semibold text-blue-400">
                {(job.win_probability !== null && job.win_probability !== undefined)
                  ? `${job.win_probability}%`
                  : job.probability !== null && job.probability !== undefined
                  ? `${job.probability}%`
                  : "--"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Health</div>
              <JobHealthBadge
                score={job.job_health_score}
                trend={job.job_health_trend}
                variant="compact"
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Momentum</div>
              <div className="text-sm font-semibold text-blue-400">
                {job.momentum_score}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Experience</div>
              <div className="text-sm font-semibold text-purple-400">
                {job.experience_score}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Risk Level</span>
              <span
                className={cn(
                  "text-xs px-2 py-1 rounded",
                  riskColors[job.risk_category] || riskColors.low
                )}
              >
                {job.risk_category.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-4">
            Contact Information
          </h3>
          <div className="space-y-3">
            {job.address && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <MapPin className="h-4 w-4 text-gray-500" />
                <span>{job.address}</span>
              </div>
            )}
            {job.phone && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Phone className="h-4 w-4 text-gray-500" />
                <a
                  href={`tel:${job.phone}`}
                  className="hover:text-white transition"
                >
                  {job.phone}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Mail className="h-4 w-4 text-gray-500" />
              <a
                href={`mailto:${job.email}`}
                className="hover:text-white transition"
              >
                {job.email}
              </a>
            </div>
            {job.estimator_name && (
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <User className="h-4 w-4 text-gray-500" />
                <span>Estimator: {job.estimator_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <span className="text-gray-500">Job Source:</span>
              <span className="text-white font-medium">
                {job.job_source_primary}
              </span>
              {job.job_source_secondary && (
                <span className="text-gray-500 text-xs truncate">
                  · {job.job_source_secondary}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Status */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-4">
            Pipeline Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Stage</span>
              <span className="text-white font-medium capitalize">
                {job.pipeline_stage.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Days in Stage</span>
              <span className="text-white">
                {job.days_in_stage} {job.days_in_stage === 1 ? "day" : "days"}
              </span>
            </div>
            {job.days_since_last_contact !== null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Days Since Last Contact</span>
                <span className="text-white">
                  {job.days_since_last_contact}{" "}
                  {job.days_since_last_contact === 1 ? "day" : "days"}
                </span>
              </div>
            )}
            {job.stage_entered_at && (
              <div className="flex justify-between">
                <span className="text-gray-400">Entered Stage</span>
                <span className="text-white text-xs">
                  {formatDistanceToNowShort(new Date(job.stage_entered_at))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* AI Recommended Next Action (Placeholder - can be enhanced) */}
        {job.job_health_score < 50 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-yellow-400 mb-1">
                  Recommended Action
                </h4>
                <p className="text-xs text-yellow-300/80">
                  This job is at risk. Consider reaching out to the homeowner
                  {job.days_since_last_contact !== null &&
                    job.days_since_last_contact > 3 &&
                    ` — it's been ${job.days_since_last_contact} days since last contact`}
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-white mb-4">Timeline</h3>
          <JobTimelineV2 leadId={job.id} />
        </div>
      </div>
    </div>
  );
}

