"use client";

// Block 22280 — SmartSend Roofing Job Calendar & Crew View v1
// Block 22390 — SmartSend Roofing Crew Capacity Engine v1
// Job Calendar: Who's On What Roof, When? + Capacity Management

import { useState, useEffect } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Job {
  id: string;
  title: string | null;
  status: string;
  job_value: number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
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
  daily_capacity?: number;
}

interface CapacityLoad {
  crew_id: string;
  working_day: string;
  total_load: number;
  crew?: Crew;
}

interface WeeklyLoad {
  totalLoad: number;
  days: number;
  avgLoad: number;
  capacity: number;
}

export default function CalendarPage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
  );

  const [data, setData] = useState<{ jobs: Job[]; crews: Crew[] } | null>(null);
  const [capacityData, setCapacityData] = useState<{
    loads: CapacityLoad[];
    crews: Crew[];
    weeklyLoads: Record<string, WeeklyLoad>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capacityWarning, setCapacityWarning] = useState<{
    show: boolean;
    message: string;
    conflicts?: Array<{ day: string; currentLoad: number; jobEffort: number; capacity: number }>;
  }>({ show: false, message: "" });

  const from = format(currentWeekStart, "yyyy-MM-dd");
  const to = format(addDays(currentWeekStart, 6), "yyyy-MM-dd");

  useEffect(() => {
    loadCalendar();
    loadCapacityData();
  }, [from, to]);

  async function loadCalendar() {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcher(`/api/calendar/jobs?from=${from}&to=${to}`);
      setData(result);
    } catch (e: any) {
      console.error("Failed to load calendar", e);
      setError(e.message || "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }

  async function loadCapacityData() {
    try {
      const result = await fetcher(`/api/scheduling/capacity-load?from=${from}&to=${to}`);
      setCapacityData(result);
    } catch (e: any) {
      console.error("Failed to load capacity data", e);
      // Don't show error, capacity is optional
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading calendar…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  const { jobs, crews } = data || { jobs: [], crews: [] };

  const days = Array.from({ length: 7 }).map((_, idx) => {
    const d = addDays(currentWeekStart, idx);
    const dateStr = format(d, "yyyy-MM-dd");

    const dayJobs = jobs.filter((job: Job) => {
      // job scheduled if its date range intersects this date
      const start = job.scheduled_start_date;
      const end = job.scheduled_end_date || job.scheduled_start_date;
      return start && end && dateStr >= start && dateStr <= end;
    });

    return { date: d, jobs: dayJobs };
  });

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">Job Calendar</h1>
          <p className="text-xs text-gray-500">
            See which jobs are on the schedule and who&apos;s on each roof.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Capacity Warning Dialog */}
      <Dialog open={capacityWarning.show} onOpenChange={(open) => setCapacityWarning({ ...capacityWarning, show: open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Capacity Exceeded
            </DialogTitle>
            <DialogDescription>{capacityWarning.message}</DialogDescription>
          </DialogHeader>
          {capacityWarning.conflicts && capacityWarning.conflicts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Conflicts:</p>
              {capacityWarning.conflicts.map((conflict, idx) => (
                <div key={idx} className="text-sm bg-red-50 p-2 rounded">
                  <p className="font-medium">{conflict.day}</p>
                  <p className="text-gray-600">
                    Current: {conflict.currentLoad.toFixed(1)} / {conflict.capacity.toFixed(1)}
                  </p>
                  <p className="text-gray-600">
                    This job adds: {conflict.jobEffort.toFixed(1)} → Total: {(conflict.currentLoad + conflict.jobEffort).toFixed(1)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCapacityWarning({ show: false, message: "" })}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calendar grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map(({ date, jobs: dayJobs }) => (
          <DayColumn
            key={date.toISOString()}
            date={date}
            jobs={dayJobs}
            crews={crews}
            capacityData={capacityData}
          />
        ))}
      </div>

      {/* Crew Summary */}
      <CrewSummary crews={crews} jobs={jobs} weeklyLoads={capacityData?.weeklyLoads} />
    </div>
  );
}

function DayColumn({
  date,
  jobs,
  crews,
  capacityData,
}: {
  date: Date;
  jobs: Job[];
  crews: Crew[];
  capacityData?: { loads: CapacityLoad[]; crews: Crew[]; weeklyLoads: Record<string, WeeklyLoad> } | null;
}) {
  const dateLabel = format(date, "EEE");
  const dateNum = format(date, "d");
  const dateStr = format(date, "yyyy-MM-dd");
  const isToday =
    format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  // Get capacity loads for this day
  const dayLoads = capacityData?.loads.filter((load) => load.working_day === dateStr) || [];

  return (
    <div
      className={`bg-gray-50 border rounded-lg p-2 min-h-[160px] flex flex-col ${
        isToday ? "border-blue-500 border-2" : ""
      }`}
    >
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-xs font-semibold uppercase text-gray-600">
          {dateLabel}
        </span>
        <span className={`text-lg font-bold ${isToday ? "text-blue-600" : ""}`}>
          {dateNum}
        </span>
      </div>

      {/* Capacity Load Bars */}
      {dayLoads.length > 0 && (
        <div className="mb-2 space-y-1">
          {dayLoads.map((load) => {
            const crew = load.crew || capacityData?.crews.find((c) => c.id === load.crew_id);
            const capacity = crew?.daily_capacity || 1.0;
            const loadPercent = (load.total_load / capacity) * 100;
            const isOverCapacity = load.total_load > capacity;
            const isHighLoad = loadPercent >= 70 && loadPercent <= 100;
            
            return (
              <div key={load.crew_id} className="text-[10px]">
                <div className="flex justify-between mb-0.5">
                  <span className="font-medium">{crew?.name || "Crew"}</span>
                  <span className={isOverCapacity ? "text-red-600 font-bold" : isHighLoad ? "text-yellow-600" : "text-gray-600"}>
                    {load.total_load.toFixed(1)} / {capacity.toFixed(1)}
                  </span>
                </div>
                <div className="h-1 w-full bg-gray-200 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      isOverCapacity
                        ? "bg-red-600"
                        : isHighLoad
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(loadPercent, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2 flex-1 overflow-y-auto">
        {jobs.map((job) => (
          <JobChip key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <p className="text-[11px] text-gray-400">No jobs scheduled.</p>
        )}
      </div>
    </div>
  );
}

function JobChip({ job }: { job: Job }) {
  const crew = job.job_crew_assignments?.[0]?.crew;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card className="bg-white border rounded px-2 py-1 shadow-sm text-[11px]">
      <p className="font-semibold truncate">
        {job.title || "Roof Job"}
      </p>
      {job.lead && (
        <p className="text-gray-600 truncate">
          {job.lead.first_name} {job.lead.last_name}
          {job.lead.city && ` • ${job.lead.city}`}
        </p>
      )}
      <p className="text-gray-500">
        {formatCurrency(job.job_value || 0)}
      </p>
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
    </Card>
  );
}

function CrewSummary({
  crews,
  jobs,
  weeklyLoads,
}: {
  crews: Crew[];
  jobs: Job[];
  weeklyLoads?: Record<string, WeeklyLoad>;
}) {
  return (
    <div className="bg-white border rounded-lg p-3 mt-4">
      <h2 className="font-semibold text-sm mb-2">Crews This Week</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        {crews.map((crew) => {
          const crewJobs = jobs.filter(
            (j) => j.job_crew_assignments?.[0]?.crew?.id === crew.id
          );

          const totalValue = crewJobs.reduce(
            (sum, job) => sum + (job.job_value || 0),
            0
          );

          const weeklyLoad = weeklyLoads?.[crew.id];
          const capacity = crew.daily_capacity || 1.0;
          const weeklyLoadPercent = weeklyLoad
            ? (weeklyLoad.avgLoad / capacity) * 100
            : 0;
          const isHighLoad = weeklyLoadPercent >= 70;
          const isOverCapacity = weeklyLoadPercent >= 100;

          const formatCurrency = (amount: number) => {
            return new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(amount);
          };

          return (
            <div key={crew.id} className="border rounded p-2 bg-gray-50">
              <div className="flex justify-between items-start mb-1">
                <p className="font-semibold">{crew.name}</p>
                {weeklyLoad && (
                  <span
                    className={`text-[10px] font-bold ${
                      isOverCapacity
                        ? "text-red-600"
                        : isHighLoad
                        ? "text-yellow-600"
                        : "text-gray-600"
                    }`}
                  >
                    {weeklyLoadPercent.toFixed(0)}%
                  </span>
                )}
              </div>
              {weeklyLoad && (
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-gray-600">Weekly Load</span>
                    <span className="text-gray-600">
                      {weeklyLoad.avgLoad.toFixed(1)} / {capacity.toFixed(1)} avg
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 rounded overflow-hidden">
                    <div
                      className={`h-full ${
                        isOverCapacity
                          ? "bg-red-600"
                          : isHighLoad
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(weeklyLoadPercent, 100)}%` }}
                    />
                  </div>
                  {isOverCapacity && (
                    <p className="text-[10px] text-red-600 mt-0.5 font-medium">
                      ⚠️ HIGH LOAD
                    </p>
                  )}
                </div>
              )}
              <p className="text-gray-600 mb-1">
                Jobs: {crewJobs.length} • Value: {formatCurrency(totalValue)}
              </p>
              <ul className="space-y-1">
                {crewJobs.slice(0, 4).map((job) => (
                  <li key={job.id} className="truncate">
                    {job.title || "Roof Job"}
                  </li>
                ))}
              </ul>
              {crewJobs.length > 4 && (
                <p className="text-[10px] text-gray-500 mt-1">
                  +{crewJobs.length - 4} more
                </p>
              )}
            </div>
          );
        })}
        {crews.length === 0 && (
          <p className="text-xs text-gray-400 col-span-full">
            No crews set up yet. Create crews to assign them to jobs.
          </p>
        )}
      </div>
    </div>
  );
}

