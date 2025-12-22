"use client";

// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Daily Briefing Card Component for individual jobs

import { BriefingStatusBadge } from "./BriefingStatusBadge";
import { BriefingNotesList } from "./BriefingNotesList";
import { MapPin, Home, DollarSign } from "lucide-react";

interface JobBriefing {
  slot_id: string;
  job_id: string;
  job_name: string;
  job_address: string;
  homeowner_name: string;
  job_value: number;
  readiness: string;
  job_notes: string[];
  start_date: string;
  end_date: string;
  crew_name: string;
  foreman_name: string | null;
  foreman_phone: string | null;
}

interface DailyBriefingCardProps {
  job: JobBriefing;
}

export function DailyBriefingCard({ job }: DailyBriefingCardProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      {/* Job Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white mb-1">
            {job.job_name}
          </h4>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <MapPin className="h-3 w-3" />
            <span>{job.job_address}</span>
          </div>
        </div>
        <BriefingStatusBadge readiness={job.readiness} />
      </div>

      {/* Homeowner Info */}
      {job.homeowner_name && (
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <Home className="h-3 w-3 text-zinc-500" />
          <span>{job.homeowner_name}</span>
        </div>
      )}

      {/* Job Value */}
      <div className="flex items-center gap-2 text-xs">
        <DollarSign className="h-3 w-3 text-green-500" />
        <span className="text-zinc-300">
          ${job.job_value.toLocaleString()}
        </span>
      </div>

      {/* Notes/Warnings */}
      {job.job_notes.length > 0 && (
        <BriefingNotesList notes={job.job_notes} />
      )}

      {/* Dates */}
      <div className="pt-2 border-t border-zinc-800 text-xs text-zinc-500">
        <div>
          Start: <span className="text-zinc-300">{job.start_date}</span>
        </div>
        {job.end_date !== job.start_date && (
          <div>
            End: <span className="text-zinc-300">{job.end_date}</span>
          </div>
        )}
      </div>
    </div>
  );
}







































