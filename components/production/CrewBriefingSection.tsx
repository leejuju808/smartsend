"use client";

// Block 22710 — SmartSend Roofing Production Alerts & Daily Crew Briefing v1
// Crew Briefing Section Component
// Groups jobs by crew and displays briefing cards

import { DailyBriefingCard } from "./DailyBriefingCard";
import { Users, Phone } from "lucide-react";

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

interface CrewBriefingSectionProps {
  crewId: string;
  crewName: string;
  foremanName: string | null;
  foremanPhone: string | null;
  jobs: JobBriefing[];
}

export function CrewBriefingSection({
  crewId,
  crewName,
  foremanName,
  foremanPhone,
  jobs,
}: CrewBriefingSectionProps) {
  return (
    <div className="space-y-4">
      {/* Crew Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400" />
          <h3 className="text-base font-semibold text-white">{crewName}</h3>
        </div>
        {foremanName && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Foreman: {foremanName}</span>
            {foremanPhone && (
              <a
                href={`tel:${foremanPhone}`}
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
              >
                <Phone className="h-3 w-3" />
                {foremanPhone}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Jobs List */}
      <div className="space-y-3">
        {jobs.map((job) => (
          <DailyBriefingCard key={job.slot_id} job={job} />
        ))}
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-4 text-xs text-zinc-400 pt-2">
        <span>
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} scheduled
        </span>
        <span>
          {jobs.filter((j) => j.readiness === "ready").length} ready
        </span>
        {jobs.filter((j) => j.readiness !== "ready").length > 0 && (
          <span className="text-yellow-400">
            {jobs.filter((j) => j.readiness !== "ready").length} need attention
          </span>
        )}
      </div>
    </div>
  );
}







































