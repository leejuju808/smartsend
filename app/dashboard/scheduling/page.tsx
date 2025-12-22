"use client";

// Block 22380 — SmartSend Roofing Job Scheduling Board v1
// Drag-and-Drop Calendar + Color-Coded Crews

import useSWR from "swr";
import { useState } from "react";
import { format, addDays, startOfWeek } from "date-fns";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Job {
  id: string;
  title: string | null;
  status: string;
  job_value: number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  weather_risk_label: string | null;
  lead: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
  } | null;
  job_crew_assignments: Array<{
    crew: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
}

interface Crew {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export default function SchedulingBoard() {
  const { data, error, mutate } = useSWR("/api/scheduling/board", fetcher);
  const [view, setView] = useState<"week" | "month">("week");
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );

  if (!data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading schedule…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">Failed to load schedule.</p>
        </div>
      </div>
    );
  }

  const { jobs, crews } = data;

  const unscheduled = jobs.filter(
    (j: Job) => !j.scheduled_start_date || j.status === "unscheduled"
  );

  async function onDropJob(jobId: string, date: string) {
    try {
      const res = await fetch("/api/scheduling/update-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, new_start_date: date }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update job date");
      }

      await mutate();
    } catch (err: any) {
      console.error("Error updating job date:", err);
      alert(err.message || "Failed to update job date");
    }
  }

  async function onAssignCrew(jobId: string, crewId: string) {
    try {
      const res = await fetch("/api/scheduling/assign-crew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, crew_id: crewId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to assign crew");
      }

      await mutate();
    } catch (err: any) {
      console.error("Error assigning crew:", err);
      alert(err.message || "Failed to assign crew");
    }
  }

  // Generate week days
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(currentWeekStart, i);
    return {
      date,
      dateStr: format(date, "yyyy-MM-dd"),
      label: format(date, "EEE"),
      dayNum: format(date, "d"),
      isToday: format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
    };
  });

  // Get jobs for each day
  const getJobsForDate = (dateStr: string) => {
    return jobs.filter((job: Job) => {
      if (!job.scheduled_start_date) return false;
      const start = job.scheduled_start_date;
      const end = job.scheduled_end_date || job.scheduled_start_date;
      return dateStr >= start && dateStr <= end;
    });
  };

  return (
    <div className="flex gap-4 p-6 h-screen overflow-hidden">
      {/* Zone 1: UNSCHEDULED JOBS */}
      <div className="w-1/4 border rounded-lg p-4 bg-white shadow-sm overflow-y-auto">
        <h2 className="font-semibold mb-3 text-sm">Unscheduled Jobs</h2>
        <div className="space-y-2">
          {unscheduled.length === 0 ? (
            <p className="text-xs text-gray-400">All jobs are scheduled.</p>
          ) : (
            unscheduled.map((job: Job) => (
              <div
                key={job.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("job", job.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="border rounded p-2 bg-gray-50 cursor-move text-xs hover:bg-gray-100 transition-colors"
              >
                <p className="font-semibold truncate">
                  {job.title || "Roof Job"}
                </p>
                {job.lead && (
                  <p className="text-gray-600 text-[11px] truncate">
                    {job.lead.first_name} {job.lead.last_name}
                    {job.lead.city && ` — ${job.lead.city}`}
                  </p>
                )}
                {job.job_value && (
                  <p className="text-gray-500 text-[10px] mt-1">
                    ${job.job_value.toLocaleString()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Zone 2: CALENDAR */}
      <div className="flex-1 border rounded-lg bg-white shadow-sm p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold text-sm">Scheduling Calendar</h2>
            <p className="text-xs text-gray-500 mt-1">
              Drag jobs onto days • Drag crews onto jobs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() =>
                setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
              className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
            >
              Next →
            </button>
            <div className="ml-2 space-x-1">
              <button
                onClick={() => setView("week")}
                className={`text-xs border px-2 py-1 rounded ${
                  view === "week"
                    ? "bg-blue-50 border-blue-300"
                    : "hover:bg-gray-50"
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setView("month")}
                className={`text-xs border px-2 py-1 rounded ${
                  view === "month"
                    ? "bg-blue-50 border-blue-300"
                    : "hover:bg-gray-50"
                }`}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* Week Grid */}
        {view === "week" && (
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const jobsToday = getJobsForDate(day.dateStr);
              return (
                <div
                  key={day.dateStr}
                  className={`border rounded-lg p-2 min-h-[400px] flex flex-col ${
                    day.isToday ? "border-blue-500 border-2 bg-blue-50/20" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const jobId = e.dataTransfer.getData("job");
                    if (jobId) {
                      onDropJob(jobId, day.dateStr);
                    }
                  }}
                >
                  <div className="flex justify-between items-baseline mb-2 pb-2 border-b">
                    <span className="text-xs font-semibold uppercase text-gray-600">
                      {day.label}
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        day.isToday ? "text-blue-600" : ""
                      }`}
                    >
                      {day.dayNum}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {jobsToday.map((job: Job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onAssignCrew={onAssignCrew}
                        crews={crews}
                      />
                    ))}
                    {jobsToday.length === 0 && (
                      <p className="text-[11px] text-gray-400 text-center py-4">
                        Drop jobs here
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Month view placeholder */}
        {view === "month" && (
          <div className="text-center py-12 text-gray-500 text-sm">
            Month view coming soon. Use week view for now.
          </div>
        )}
      </div>

      {/* Zone 3: CREWS */}
      <div className="w-1/4 border rounded-lg p-4 bg-white shadow-sm overflow-y-auto">
        <h2 className="font-semibold text-sm mb-3">Crews</h2>
        <div className="space-y-2">
          {crews.length === 0 ? (
            <p className="text-xs text-gray-400">No crews set up yet.</p>
          ) : (
            crews.map((crew: Crew) => (
              <div
                key={crew.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("crew", crew.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="border rounded p-2 cursor-move text-xs hover:shadow-sm transition-shadow"
                style={{
                  backgroundColor: crew.color
                    ? `${crew.color}15`
                    : "#f3f4f6",
                  borderColor: crew.color || "#e5e7eb",
                }}
              >
                <p
                  className="font-semibold"
                  style={crew.color ? { color: crew.color } : {}}
                >
                  {crew.name}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function JobCard({
  job,
  onAssignCrew,
  crews,
}: {
  job: Job;
  onAssignCrew: (jobId: string, crewId: string) => void;
  crews: Crew[];
}) {
  const crew = job.job_crew_assignments?.[0]?.crew;

  // Weather risk styling
  const getWeatherBorderClass = () => {
    if (job.weather_risk_label === "high") return "border-red-600 border-2";
    if (job.weather_risk_label === "medium") return "border-yellow-500 border-2";
    if (job.weather_risk_label === "low") return "border-green-500";
    return "border-gray-200";
  };

  return (
    <div
      className={`border rounded p-2 bg-white shadow-sm text-[11px] ${getWeatherBorderClass()}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const crewId = e.dataTransfer.getData("crew");
        if (crewId) {
          onAssignCrew(job.id, crewId);
        }
      }}
    >
      <p className="font-semibold truncate">{job.title || "Roof Job"}</p>
      {job.lead && (
        <p className="text-gray-600 truncate text-[10px]">
          {job.lead.first_name} {job.lead.last_name}
          {job.lead.city && ` • ${job.lead.city}`}
        </p>
      )}
      {job.job_value && (
        <p className="text-gray-500 text-[10px] mt-1">
          ${job.job_value.toLocaleString()}
        </p>
      )}
      {crew && (
        <p className="text-[10px] mt-1">
          Crew:{" "}
          <span
            className="font-medium"
            style={crew.color ? { color: crew.color } : {}}
          >
            {crew.name}
          </span>
        </p>
      )}
      {!crew && (
        <p className="text-[10px] text-gray-400 mt-1 italic">
          Drop crew here
        </p>
      )}
      {job.weather_risk_label && (
        <p
          className={`text-[9px] mt-1 font-medium ${
            job.weather_risk_label === "high"
              ? "text-red-600"
              : job.weather_risk_label === "medium"
              ? "text-yellow-600"
              : "text-green-600"
          }`}
        >
          {job.weather_risk_label.toUpperCase()} weather risk
        </p>
      )}
    </div>
  );
}








































