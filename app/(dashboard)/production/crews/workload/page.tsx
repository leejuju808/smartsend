"use client";

// Crew Workload Page
// Displays hours booked per day, underutilized crews, overbooked crews, suggestion engine

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Users, TrendingUp, AlertTriangle, Calendar, Clock } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface CapacityReport {
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
  total_hours: number;
}

export default function CrewWorkloadPage() {
  const supabase = createClientComponentClient();
  const [reports, setReports] = useState<CapacityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));

  useEffect(() => {
    loadCapacityReport();
  }, [currentWeek]);

  async function loadCapacityReport() {
    setLoading(true);
    try {
      const weekStart = format(currentWeek, "yyyy-MM-dd");
      const response = await fetch(`/api/production/capacity-report?week_start=${weekStart}`);
      const data = await response.json();
      setReports(data.reports || []);
    } catch (error) {
      console.error("Error loading capacity report:", error);
    } finally {
      setLoading(false);
    }
  }

  const overbookedCrews = reports.filter((r) => r.is_overloaded);
  const underutilizedCrews = reports.filter((r) => r.load_percentage < 50 && r.jobs_scheduled > 0);
  const idleCrews = reports.filter((r) => r.jobs_scheduled === 0);

  // Chart data
  const chartData = reports.map((report) => ({
    name: report.crew_name,
    "Hours Booked": Math.round(report.total_hours),
    "Capacity (40h)": 40,
    "Load %": Math.round(report.load_percentage),
  }));

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">Loading crew workload...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Crew Workload</h1>
          <p className="text-sm text-gray-500 mt-1">
            Daily crew utilization • Underutilized crews • Overbooked crews
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            ← Previous Week
          </button>
          <div className="px-3 py-2 text-sm font-medium">
            Week of {format(currentWeek, "MMM d")}
          </div>
          <button
            onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Next Week →
          </button>
          <button
            onClick={() => setCurrentWeek(startOfWeek(new Date()))}
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            This Week
          </button>
        </div>
      </div>

      {/* Alerts */}
      {overbookedCrews.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="font-semibold text-red-900">
              {overbookedCrews.length} Overbooked Crew{overbookedCrews.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-1">
            {overbookedCrews.map((crew) => (
              <div key={crew.crew_id} className="text-sm text-red-800">
                <strong>{crew.crew_name}:</strong> {crew.load_percentage.toFixed(0)}% capacity
                ({crew.jobs_scheduled} jobs, {crew.total_squares_scheduled.toFixed(0)} squares)
              </div>
            ))}
          </div>
        </div>
      )}

      {underutilizedCrews.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-yellow-600" />
            <h3 className="font-semibold text-yellow-900">
              {underutilizedCrews.length} Underutilized Crew{underutilizedCrews.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-1">
            {underutilizedCrews.map((crew) => (
              <div key={crew.crew_id} className="text-sm text-yellow-800">
                <strong>{crew.crew_name}:</strong> Only {crew.load_percentage.toFixed(0)}% capacity
                ({crew.jobs_scheduled} jobs) — Opportunity to add more work
              </div>
            ))}
          </div>
        </div>
      )}

      {idleCrews.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-900">
              {idleCrews.length} Idle Crew{idleCrews.length !== 1 ? "s" : ""}
            </h3>
          </div>
          <div className="space-y-1">
            {idleCrews.map((crew) => (
              <div key={crew.crew_id} className="text-sm text-blue-800">
                <strong>{crew.crew_name}:</strong> No jobs scheduled this week — Lost revenue opportunity
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Weekly Hours Booked vs Capacity</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Hours Booked" fill="#3B82F6" />
              <Bar dataKey="Capacity (40h)" fill="#E5E7EB" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Crew Reports */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Crew Details</h2>
        {reports.map((report) => (
          <div key={report.crew_id} className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{report.crew_name}</h3>
                <p className="text-sm text-gray-500">
                  {report.jobs_scheduled} jobs • {report.total_squares_scheduled.toFixed(0)} squares
                </p>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${
                  report.is_overloaded ? "text-red-600" :
                  report.load_percentage > 80 ? "text-yellow-600" :
                  "text-green-600"
                }`}>
                  {report.load_percentage.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">capacity</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500">Total Hours</div>
                <div className="font-semibold">{report.total_hours.toFixed(1)}h</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Scheduled</div>
                <div className="font-semibold">{report.scheduled_count}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">In Progress</div>
                <div className="font-semibold">{report.in_progress_count}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Projected Revenue</div>
                <div className="font-semibold">${report.projected_revenue.toLocaleString()}</div>
              </div>
            </div>

            {/* Capacity Bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Capacity Utilization</span>
                <span>{report.load_percentage.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    report.is_overloaded ? "bg-red-500" :
                    report.load_percentage > 80 ? "bg-yellow-500" :
                    "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(report.load_percentage, 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {report.total_squares_scheduled.toFixed(0)} / {report.weekly_capacity_squares.toFixed(0)} squares
              </div>
            </div>

            {report.idle_days > 0 && (
              <div className="mt-3 text-sm text-blue-600">
                <Clock className="h-4 w-4 inline mr-1" />
                {report.idle_days} idle day{report.idle_days !== 1 ? "s" : ""} this week
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
































