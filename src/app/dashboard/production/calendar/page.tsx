"use client";

// Block 38390 — SmartSend Roofing Production Calendar + Crew Load Balancing Engine v1
// Production Calendar with Month/Week/Day views, crew load balancing, and conflict detection

import { useState, useEffect, useMemo } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, addWeeks, isSameDay, isSameMonth, parseISO, eachDayOfInterval } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle, Users, TrendingUp, Clock, Package, Cloud, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

type ProductionCalendarEntry = {
  id: string;
  job_id: string;
  crew_id: string;
  start_date: string;
  end_date: string;
  estimated_duration_days: number;
  ai_predicted_duration_days?: number;
  actual_duration_days?: number;
  status: "scheduled" | "in_progress" | "delayed" | "completed" | "canceled";
  delay_reason?: string;
  delay_days?: number;
  material_eta?: string;
  material_delivered: boolean;
  weather_risk?: string;
  weather_alert?: string;
  notes?: string;
  job?: {
    id: string;
    title: string;
    job_value: number;
    estimated_squares?: number;
    official_squares?: number;
  };
  crew?: {
    id: string;
    name: string;
    foreman_name?: string;
    daily_capacity_squares?: number;
  };
};

type ScheduleConflict = {
  id: string;
  job_id: string;
  crew_id: string;
  conflict_type: string;
  severity: "low" | "medium" | "high" | "critical";
  details: any;
  job?: {
    id: string;
    title: string;
    homeowner_name?: string;
  };
  crew?: {
    id: string;
    name: string;
  };
};

type CapacityReport = {
  workspace_id: string;
  week_start: string;
  crew_id: string;
  crew_name: string;
  jobs_scheduled: number;
  total_squares_scheduled: number;
  weekly_capacity_squares: number;
  weekly_capacity_jobs: number;
  load_percentage: number;
  projected_revenue: number;
  scheduled_count: number;
  in_progress_count: number;
  delayed_count: number;
  is_overloaded: boolean;
  idle_days: number;
};

type ViewType = "month" | "week" | "day";

export default function ProductionCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewType>("week");
  const [calendar, setCalendar] = useState<ProductionCalendarEntry[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [capacityReports, setCapacityReports] = useState<CapacityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate));
      const end = endOfWeek(endOfMonth(currentDate));
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    } else if (view === "week") {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
    } else {
      const start = format(currentDate, "yyyy-MM-dd");
      return { start, end: start };
    }
  }, [currentDate, view]);

  // Fetch calendar data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [calendarRes, conflictsRes, capacityRes] = await Promise.all([
          fetch(`/api/production/calendar?from=${dateRange.start}&to=${dateRange.end}${selectedCrew ? `&crew_id=${selectedCrew}` : ""}`),
          fetch(`/api/production/conflicts?resolved=false`),
          fetch(`/api/production/capacity-report`),
        ]);

        const calendarData = await calendarRes.json();
        const conflictsData = await conflictsRes.json();
        const capacityData = await capacityRes.json();

        setCalendar(calendarData.calendar || []);
        setConflicts(conflictsData.conflicts || []);
        setCapacityReports(capacityData.reports || []);
      } catch (error) {
        console.error("Error fetching production calendar:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [dateRange, selectedCrew]);

  // Get unique crews for filter
  const crews = useMemo(() => {
    const crewSet = new Set<string>();
    calendar.forEach((entry) => {
      if (entry.crew_id) crewSet.add(entry.crew_id);
    });
    return Array.from(crewSet);
  }, [calendar]);

  // Get jobs for current view
  const jobsInView = useMemo(() => {
    const start = parseISO(dateRange.start);
    const end = parseISO(dateRange.end || dateRange.start);
    const days = eachDayOfInterval({ start, end });

    return days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const jobs = calendar.filter((entry) => {
        const entryStart = parseISO(entry.start_date);
        const entryEnd = parseISO(entry.end_date);
        return entryStart <= day && entryEnd >= day && entry.status !== "canceled";
      });
      return { date: day, dayStr, jobs };
    });
  }, [calendar, dateRange]);

  // Crew load data for chart
  const crewLoadData = useMemo(() => {
    const crewMap = new Map<string, { name: string; squares: number; jobs: number }>();

    calendar.forEach((entry) => {
      if (entry.crew_id && entry.status !== "canceled") {
        const crew = crewMap.get(entry.crew_id) || {
          name: entry.crew?.name || "Unknown",
          squares: 0,
          jobs: 0,
        };
        crew.squares += entry.job?.estimated_squares || entry.job?.official_squares || 0;
        crew.jobs += 1;
        crewMap.set(entry.crew_id, crew);
      }
    });

    return Array.from(crewMap.values());
  }, [calendar]);

  const criticalConflicts = conflicts.filter((c) => c.severity === "critical" || c.severity === "high");

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading production calendar…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-schedule installs • Prevent double-booking • Balance crews • Predict job duration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, -1))}
            className="p-2 border rounded hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 border rounded hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Conflict Alerts */}
      {criticalConflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-900">
              {criticalConflicts.length} Critical Conflict{criticalConflicts.length !== 1 ? "s" : ""} Detected
            </h3>
          </div>
          <div className="space-y-2">
            {criticalConflicts.slice(0, 3).map((conflict) => (
              <div key={conflict.id} className="text-sm text-red-800">
                <strong>{conflict.conflict_type.replace("_", " ")}:</strong> {conflict.job?.title || "Unknown job"} - {conflict.crew?.name || "Unknown crew"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Toggle & Filters */}
      <div className="flex items-center justify-between bg-white border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("month")}
            className={`px-3 py-1 text-sm rounded ${
              view === "month" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView("week")}
            className={`px-3 py-1 text-sm rounded ${
              view === "week" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView("day")}
            className={`px-3 py-1 text-sm rounded ${
              view === "day" ? "bg-blue-50 border border-blue-300 text-blue-700" : "border hover:bg-gray-50"
            }`}
          >
            Day
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCrew || ""}
            onChange={(e) => setSelectedCrew(e.target.value || null)}
            className="text-sm border rounded px-3 py-1"
          >
            <option value="">All Crews</option>
            {crews.map((crewId) => {
              const entry = calendar.find((e) => e.crew_id === crewId);
              return (
                <option key={crewId} value={crewId}>
                  {entry?.crew?.name || "Unknown"}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2 bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-4">
            {view === "month" && format(currentDate, "MMMM yyyy")}
            {view === "week" && `Week of ${format(startOfWeek(currentDate), "MMM d")}`}
            {view === "day" && format(currentDate, "EEEE, MMMM d, yyyy")}
          </h2>

          {view === "month" && (
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-xs font-semibold text-gray-600 p-2 text-center">
                  {day}
                </div>
              ))}
              {jobsInView.map(({ date, dayStr, jobs }) => (
                <div
                  key={dayStr}
                  className={`min-h-24 border rounded p-2 ${
                    isSameMonth(date, currentDate) ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <div className="text-xs font-medium mb-1">{format(date, "d")}</div>
                  <div className="space-y-1">
                    {jobs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`text-xs p-1 rounded ${
                          entry.status === "delayed"
                            ? "bg-red-100 text-red-800"
                            : entry.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                        title={entry.job?.title || "Unknown job"}
                      >
                        {entry.crew?.name || "No crew"} - {entry.job?.title || "Unknown"}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "week" && (
            <div className="grid grid-cols-7 gap-2">
              {jobsInView.map(({ date, dayStr, jobs }) => (
                <div key={dayStr} className="border rounded p-2">
                  <div className="text-xs font-semibold mb-2">{format(date, "EEE d")}</div>
                  <div className="space-y-2">
                    {jobs.map((entry) => (
                      <div
                        key={entry.id}
                        className={`text-xs p-2 rounded border ${
                          entry.status === "delayed"
                            ? "border-red-300 bg-red-50"
                            : entry.status === "in_progress"
                            ? "border-blue-300 bg-blue-50"
                            : "border-green-300 bg-green-50"
                        }`}
                      >
                        <div className="font-medium">{entry.job?.title || "Unknown"}</div>
                        <div className="text-gray-600">{entry.crew?.name || "No crew"}</div>
                        {entry.delay_reason && (
                          <div className="text-red-600 text-xs mt-1">
                            <AlertTriangle className="h-3 w-3 inline" /> {entry.delay_reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === "day" && (
            <div className="space-y-2">
              {jobsInView[0]?.jobs.map((entry) => (
                <div
                  key={entry.id}
                  className="border rounded p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{entry.job?.title || "Unknown job"}</h3>
                    <span className={`text-xs px-2 py-1 rounded ${
                      entry.status === "delayed" ? "bg-red-100 text-red-800" :
                      entry.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                      "bg-green-100 text-green-800"
                    }`}>
                      {entry.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Crew</div>
                      <div className="font-medium">{entry.crew?.name || "No crew"}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Duration</div>
                      <div className="font-medium">{entry.estimated_duration_days} days</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Squares</div>
                      <div className="font-medium">{entry.job?.estimated_squares || entry.job?.official_squares || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Value</div>
                      <div className="font-medium">${entry.job?.job_value?.toLocaleString() || "N/A"}</div>
                    </div>
                  </div>
                  {entry.delay_reason && (
                    <div className="mt-2 text-sm text-red-600">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      Delay: {entry.delay_reason} ({entry.delay_days} days)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Crew Load & Capacity */}
        <div className="space-y-6">
          {/* Crew Load Chart */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Crew Load
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crewLoadData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="squares" fill="#3B82F6" name="Squares" />
                  <Bar dataKey="jobs" fill="#10B981" name="Jobs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Capacity Summary */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Capacity Summary
            </h3>
            <div className="space-y-3">
              {capacityReports.slice(0, 5).map((report) => (
                <div key={`${report.crew_id}-${report.week_start}`} className="border rounded p-3">
                  <div className="font-medium text-sm">{report.crew_name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {report.jobs_scheduled} jobs • {report.total_squares_scheduled.toFixed(0)} squares
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Load</span>
                      <span>{report.load_percentage.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          report.is_overloaded ? "bg-red-500" : report.load_percentage > 80 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(report.load_percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
































