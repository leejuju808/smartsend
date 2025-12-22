"use client";

// Block 242000 — SmartSend Roofing Scheduling Engine v2
// Full Production Scheduler with Drag-and-Drop, Heatmap, Map View, Weather Overlay

import useSWR from "swr";
import { useState, useEffect } from "react";
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { 
  Calendar, 
  MapPin, 
  Cloud, 
  CloudRain, 
  AlertTriangle, 
  TrendingUp,
  Users,
  Clock,
  Zap,
  Map,
  BarChart3,
  Settings
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Job {
  id: string;
  title: string | null;
  address: string | null;
  job_type: string | null;
  job_value: number;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
  scheduled_start?: string;
  scheduled_end?: string;
  estimated_duration_hours?: number;
  weather_risk_label?: string | null;
  status: string;
  lead?: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
  } | null;
  crew?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface Crew {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

type ViewMode = "calendar" | "heatmap" | "map" | "timeline";

export default function SchedulingEngineV2() {
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(true);

  const { data, error, mutate } = useSWR("/api/scheduling/board", fetcher);

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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Scheduling Engine v2
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Production Command Center
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWeatherOverlay(!showWeatherOverlay)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showWeatherOverlay
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Cloud className="w-4 h-4 inline mr-1" />
              Weather
            </button>
            <button
              onClick={async () => {
                // Trigger AI suggestions
                const res = await fetch("/api/scheduling/suggest", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    job_ids: jobs.map((j: Job) => j.id),
                  }),
                });
                if (res.ok) {
                  const suggestions = await res.json();
                  console.log("AI Suggestions:", suggestions);
                  alert(`Generated ${suggestions.suggestions.length} scheduling suggestions`);
                }
              }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gold-500 text-white hover:bg-gold-600 transition-colors"
            >
              <Zap className="w-4 h-4 inline mr-1" />
              AI Suggest
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => setViewMode("calendar")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "calendar"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-1" />
            Calendar
          </button>
          <button
            onClick={() => setViewMode("heatmap")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "heatmap"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <BarChart3 className="w-4 h-4 inline mr-1" />
            Heatmap
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "map"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Map className="w-4 h-4 inline mr-1" />
            Map
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === "timeline"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Clock className="w-4 h-4 inline mr-1" />
            Timeline
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "calendar" && (
          <CalendarView
            jobs={jobs}
            crews={crews}
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            showWeatherOverlay={showWeatherOverlay}
            onMutate={mutate}
          />
        )}
        {viewMode === "heatmap" && (
          <HeatmapView jobs={jobs} crews={crews} />
        )}
        {viewMode === "map" && (
          <MapView jobs={jobs} crews={crews} />
        )}
        {viewMode === "timeline" && (
          <TimelineView jobs={jobs} crews={crews} />
        )}
      </div>
    </div>
  );
}

// Calendar View Component
function CalendarView({
  jobs,
  crews,
  currentWeekStart,
  setCurrentWeekStart,
  showWeatherOverlay,
  onMutate,
}: {
  jobs: Job[];
  crews: Crew[];
  currentWeekStart: Date;
  setCurrentWeekStart: (date: Date) => void;
  showWeatherOverlay: boolean;
  onMutate: () => void;
}) {
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(currentWeekStart, i);
    return {
      date,
      dateStr: format(date, "yyyy-MM-dd"),
      label: format(date, "EEE"),
      dayNum: format(date, "d"),
      isToday: isSameDay(date, new Date()),
    };
  });

  const getJobsForDate = (dateStr: string) => {
    return jobs.filter((job: Job) => {
      const start = job.scheduled_start_date || job.scheduled_start?.split('T')[0];
      const end = job.scheduled_end_date || job.scheduled_end?.split('T')[0];
      if (!start) return false;
      return dateStr >= start && (!end || dateStr <= end);
    });
  };

  return (
    <div className="flex gap-4 p-6 h-full overflow-hidden">
      {/* Unscheduled Jobs */}
      <div className="w-64 border rounded-lg p-4 bg-white shadow-sm overflow-y-auto">
        <h2 className="font-semibold mb-3 text-sm">Unscheduled Jobs</h2>
        <div className="space-y-2">
          {jobs
            .filter((j: Job) => !j.scheduled_start_date && !j.scheduled_start)
            .map((job: Job) => (
              <JobCard
                key={job.id}
                job={job}
                crews={crews}
                onMutate={onMutate}
                draggable
              />
            ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 border rounded-lg bg-white shadow-sm p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
              className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
            >
              ← Prev
            </button>
            <button
              onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
              className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
            >
              Next →
            </button>
            <span className="text-sm font-medium ml-4">
              {format(currentWeekStart, "MMMM d")} - {format(addDays(currentWeekStart, 6), "d, yyyy")}
            </span>
          </div>
        </div>

        {/* Week Grid */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const jobsToday = getJobsForDate(day.dateStr);
            return (
              <DayColumn
                key={day.dateStr}
                day={day}
                jobs={jobsToday}
                crews={crews}
                showWeatherOverlay={showWeatherOverlay}
                onMutate={onMutate}
              />
            );
          })}
        </div>
      </div>

      {/* Crews Sidebar */}
      <div className="w-64 border rounded-lg p-4 bg-white shadow-sm overflow-y-auto">
        <h2 className="font-semibold text-sm mb-3">Crews</h2>
        <div className="space-y-2">
          {crews.map((crew: Crew) => (
            <div
              key={crew.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("crew", crew.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="border rounded p-2 cursor-move text-xs hover:shadow-sm transition-shadow"
              style={{
                backgroundColor: crew.color ? `${crew.color}15` : "#f3f4f6",
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
          ))}
        </div>
      </div>
    </div>
  );
}

// Day Column Component
function DayColumn({
  day,
  jobs,
  crews,
  showWeatherOverlay,
  onMutate,
}: {
  day: any;
  jobs: Job[];
  crews: Crew[];
  showWeatherOverlay: boolean;
  onMutate: () => void;
}) {
  const [weatherData, setWeatherData] = useState<any>(null);

  // Fetch weather for this day
  useEffect(() => {
    if (showWeatherOverlay) {
      fetch(`/api/scheduling/weather/check?date=${day.dateStr}`)
        .then((res) => res.json())
        .then((data) => setWeatherData(data))
        .catch(console.error);
    }
  }, [showWeatherOverlay, day.dateStr]);

  return (
    <div
      className={`border rounded-lg p-2 min-h-[500px] flex flex-col ${
        day.isToday ? "border-blue-500 border-2 bg-blue-50/20" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const jobId = e.dataTransfer.getData("job");
        if (jobId) {
          await fetch("/api/scheduling/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_id: jobId,
              scheduled_start: `${day.dateStr}T07:00:00`,
              scheduled_end: `${day.dateStr}T17:00:00`,
            }),
          });
          onMutate();
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

      {/* Weather Overlay */}
      {showWeatherOverlay && weatherData && (
        <div className={`mb-2 p-1 rounded text-[10px] ${
          weatherData.risk_level === "high" || weatherData.risk_level === "severe"
            ? "bg-red-100 text-red-700"
            : weatherData.risk_level === "medium"
            ? "bg-yellow-100 text-yellow-700"
            : "bg-green-100 text-green-700"
        }`}>
          <CloudRain className="w-3 h-3 inline mr-1" />
          {weatherData.precipitation_probability}% rain
        </div>
      )}

      <div className="space-y-2 flex-1 overflow-y-auto">
        {jobs.map((job: Job) => (
          <JobCard
            key={job.id}
            job={job}
            crews={crews}
            onMutate={onMutate}
          />
        ))}
        {jobs.length === 0 && (
          <p className="text-[11px] text-gray-400 text-center py-4">
            Drop jobs here
          </p>
        )}
      </div>
    </div>
  );
}

// Job Card Component
function JobCard({
  job,
  crews,
  onMutate,
  draggable = false,
}: {
  job: Job;
  crews: Crew[];
  onMutate: () => void;
  draggable?: boolean;
}) {
  const getWeatherBorderClass = () => {
    if (job.weather_risk_label === "high" || job.weather_risk_label === "severe")
      return "border-red-600 border-2";
    if (job.weather_risk_label === "medium") return "border-yellow-500 border-2";
    if (job.weather_risk_label === "low") return "border-green-500";
    return "border-gray-200";
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (draggable) {
          e.dataTransfer.setData("job", job.id);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
      className={`border rounded p-2 bg-white shadow-sm text-[11px] ${getWeatherBorderClass()} ${
        draggable ? "cursor-move hover:shadow-md" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={async (e) => {
        e.preventDefault();
        const crewId = e.dataTransfer.getData("crew");
        if (crewId) {
          await fetch("/api/scheduling/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_id: job.id,
              crew_id: crewId,
              scheduled_start: job.scheduled_start || `${job.scheduled_start_date}T07:00:00`,
              scheduled_end: job.scheduled_end || `${job.scheduled_end_date}T17:00:00`,
            }),
          });
          onMutate();
        }
      }}
    >
      <p className="font-semibold truncate">{job.title || "Roof Job"}</p>
      {job.address && (
        <p className="text-gray-600 truncate text-[10px] mt-1">
          <MapPin className="w-3 h-3 inline mr-1" />
          {job.address.split(",")[0]}
        </p>
      )}
      {job.job_value && (
        <p className="text-gray-500 text-[10px] mt-1">
          ${job.job_value.toLocaleString()}
        </p>
      )}
      {job.estimated_duration_hours && (
        <p className="text-gray-500 text-[10px] mt-1">
          <Clock className="w-3 h-3 inline mr-1" />
          {job.estimated_duration_hours}h
        </p>
      )}
      {job.crew && (
        <p className="text-[10px] mt-1">
          Crew:{" "}
          <span
            className="font-medium"
            style={job.crew.color ? { color: job.crew.color } : {}}
          >
            {job.crew.name}
          </span>
        </p>
      )}
      {job.weather_risk_label && (
        <p
          className={`text-[9px] mt-1 font-medium ${
            job.weather_risk_label === "high" || job.weather_risk_label === "severe"
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

// Heatmap View Component
function HeatmapView({ jobs, crews }: { jobs: Job[]; crews: Crew[] }) {
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null);

  // Calculate capacity per crew per day
  const capacityData = crews.map((crew) => {
    const crewJobs = jobs.filter(
      (j: Job) => j.crew?.id === crew.id
    );
    const daysWithJobs: Record<string, number> = {};

    crewJobs.forEach((job: Job) => {
      const start = job.scheduled_start_date || job.scheduled_start?.split('T')[0];
      const end = job.scheduled_end_date || job.scheduled_end?.split('T')[0];
      if (start) {
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : startDate;
        for (
          let d = new Date(startDate);
          d <= endDate;
          d.setDate(d.getDate() + 1)
        ) {
          const dateStr = format(d, "yyyy-MM-dd");
          daysWithJobs[dateStr] = (daysWithJobs[dateStr] || 0) + 1;
        }
      }
    });

    return {
      crew,
      daysWithJobs,
      totalJobs: crewJobs.length,
    };
  });

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Capacity Heatmap</h2>
      <div className="grid grid-cols-1 gap-4">
        {capacityData.map(({ crew, daysWithJobs, totalJobs }) => (
          <div key={crew.id} className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{crew.name}</h3>
              <span className="text-sm text-gray-500">{totalJobs} jobs</span>
            </div>
            <div className="grid grid-cols-14 gap-1">
              {Array.from({ length: 14 }).map((_, i) => {
                const date = addDays(new Date(), i);
                const dateStr = format(date, "yyyy-MM-dd");
                const jobCount = daysWithJobs[dateStr] || 0;
                const intensity = Math.min(1, jobCount / 3); // 3+ jobs = max intensity

                return (
                  <div
                    key={dateStr}
                    className={`h-8 rounded text-[10px] flex items-center justify-center ${
                      intensity > 0.8
                        ? "bg-red-500 text-white"
                        : intensity > 0.5
                        ? "bg-orange-400 text-white"
                        : intensity > 0.2
                        ? "bg-yellow-300"
                        : "bg-gray-100"
                    }`}
                    title={`${dateStr}: ${jobCount} jobs`}
                  >
                    {jobCount > 0 ? jobCount : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Map View Component (Placeholder)
function MapView({ jobs, crews }: { jobs: Job[]; crews: Crew[] }) {
  return (
    <div className="p-6 h-full">
      <h2 className="text-xl font-bold mb-4">Map View</h2>
      <div className="border rounded-lg bg-gray-100 h-full flex items-center justify-center">
        <p className="text-gray-500">
          Map integration coming soon. Jobs will be displayed as pins with routing lines.
        </p>
      </div>
    </div>
  );
}

// Timeline View Component
function TimelineView({ jobs, crews }: { jobs: Job[]; crews: Crew[] }) {
  const scheduledJobs = jobs.filter(
    (j: Job) => j.scheduled_start_date || j.scheduled_start
  );

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">Job Timeline</h2>
      <div className="space-y-4">
        {scheduledJobs.map((job: Job) => (
          <div key={job.id} className="border rounded-lg p-4 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{job.title || "Roof Job"}</h3>
                {job.address && (
                  <p className="text-sm text-gray-600 mt-1">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    {job.address}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">
                  {job.scheduled_start_date || job.scheduled_start?.split('T')[0]}
                </p>
                {job.estimated_duration_hours && (
                  <p className="text-xs text-gray-500">
                    {job.estimated_duration_hours}h estimated
                  </p>
                )}
              </div>
            </div>
            {job.crew && (
              <div className="mt-2">
                <span
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: job.crew.color ? `${job.crew.color}20` : "#f3f4f6",
                    color: job.crew.color || "#666",
                  }}
                >
                  {job.crew.name}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

























