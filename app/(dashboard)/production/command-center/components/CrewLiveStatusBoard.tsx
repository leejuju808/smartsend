"use client";

// Block 246000 — Crew Live Status Board
// Each row = crew, shows: assigned job, arrival time, started?, photos uploaded?, issues?, % progress, travel time, next job

import { Users, MapPin, Clock, Camera, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Crew {
  id: string;
  name: string;
  foreman_name: string | null;
  foreman_phone: string | null;
  is_active: boolean;
}

interface Job {
  id: string;
  title: string;
  address: string;
  crew_id: string | null;
  status: string;
}

interface Event {
  id: string;
  event_type: string;
  created_at: string;
  job_id: string | null;
  crew_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
  } | null;
}

interface CrewLiveStatusBoardProps {
  crews: Crew[];
  jobs: Job[];
  events: Event[];
}

export function CrewLiveStatusBoard({ crews, jobs, events }: CrewLiveStatusBoardProps) {
  const getCrewCurrentJob = (crewId: string) => {
    return jobs.find(j => j.crew_id === crewId && j.status === 'in_progress') ||
           jobs.find(j => j.crew_id === crewId && j.status === 'scheduled');
  };

  const getCrewEvents = (crewId: string) => {
    return events.filter(e => e.crew_id === crewId);
  };

  const getCrewStatus = (crew: Crew) => {
    const crewEvents = getCrewEvents(crew.id);
    const clockInEvent = crewEvents.find(e => e.event_type === 'crew_clock_in' && new Date(e.created_at).toDateString() === new Date().toDateString());
    const clockOutEvent = crewEvents.find(e => e.event_type === 'crew_clock_out' && new Date(e.created_at).toDateString() === new Date().toDateString());
    
    if (clockInEvent && !clockOutEvent) {
      return { status: 'working', clockInTime: clockInEvent.created_at };
    }
    return { status: 'not_working', clockInTime: null };
  };

  const getCrewIssues = (crewId: string) => {
    // This would come from alerts filtered by crew_id
    return 0; // Placeholder
  };

  const getCrewPhotos = (crewId: string) => {
    const crewEvents = getCrewEvents(crew.id);
    return crewEvents.filter(e => e.event_type === 'material_delivered' || e.event_type === 'job_completed').length;
  };

  const activeCrews = crews.filter(c => c.is_active);

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Crew Live Status</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {activeCrews.length} active crews
        </div>
      </div>

      <div className="space-y-2">
        {activeCrews.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">
            No active crews
          </div>
        ) : (
          activeCrews.map((crew) => {
            const currentJob = getCrewCurrentJob(crew.id);
            const crewStatus = getCrewStatus(crew);
            const issues = getCrewIssues(crew.id);
            const photos = getCrewPhotos(crew.id);

            return (
              <div
                key={crew.id}
                className="bg-zinc-800/50 rounded-lg border border-zinc-700 p-3 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-white">{crew.name}</h3>
                      {crew.foreman_name && (
                        <span className="text-xs text-zinc-400">
                          ({crew.foreman_name})
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          crewStatus.status === 'working'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-zinc-700 text-zinc-400'
                        }`}
                      >
                        {crewStatus.status === 'working' ? 'Working' : 'Not Working'}
                      </span>
                    </div>

                    {currentJob ? (
                      <div className="space-y-1.5">
                        <Link href={`/production/jobs/${currentJob.id}`}>
                          <div className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{currentJob.title || currentJob.address}</span>
                          </div>
                        </Link>
                        <div className="flex items-center gap-4 text-xs text-zinc-400">
                          {crewStatus.clockInTime && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                Started: {new Date(crewStatus.clockInTime).toLocaleTimeString()}
                              </span>
                            </div>
                          )}
                          {photos > 0 && (
                            <div className="flex items-center gap-1">
                              <Camera className="h-3 w-3" />
                              <span>{photos} photos</span>
                            </div>
                          )}
                          {issues > 0 && (
                            <div className="flex items-center gap-1 text-yellow-400">
                              <AlertCircle className="h-3 w-3" />
                              <span>{issues} issues</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">No job assigned</div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {currentJob && (
                      <div className="text-xs text-zinc-400">
                        <TrendingUp className="h-3 w-3 inline mr-1" />
                        In Progress
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

























