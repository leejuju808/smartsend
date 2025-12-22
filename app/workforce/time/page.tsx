"use client";

// Block 251600 — SmartSend Workforce Hub v1
// Production Manager Time Tracking Dashboard
// app/workforce/time/page.tsx

import { useEffect, useState } from "react";
import { Clock, Users, AlertTriangle, MapPin, TrendingUp } from "lucide-react";

interface ActiveClockIn {
  id: string;
  employee_id: string;
  job_id: string;
  clock_in: string;
  clock_in_lat: number;
  clock_in_lng: number;
  employee: {
    first_name: string;
    last_name: string;
    role: string;
  };
  job: {
    id: string;
    notes: string | null;
    site_lat: number | null;
    site_lng: number | null;
  };
}

interface HoursPerJob {
  job_id: string;
  job_name: string;
  total_hours: number;
  employee_count: number;
}

interface HoursPerEmployee {
  employee_id: string;
  employee_name: string;
  total_hours: number;
  job_count: number;
}

interface DashboardData {
  active_clock_ins: ActiveClockIn[];
  hours_per_job_today: HoursPerJob[];
  hours_per_employee_week: HoursPerEmployee[];
  flags: {
    clock_ins_outside_radius: any[];
    missing_clock_outs: any[];
  };
}

export default function WorkforceTimeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await fetch("/api/workforce/time/dashboard");
      if (!response.ok) {
        throw new Error("Failed to load dashboard");
      }
      const dashboardData = await response.json();
      setData(dashboardData);
      setError(null);
    } catch (err: any) {
      console.error("Error loading dashboard:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-red-600 font-semibold mb-2">Error</div>
          <div className="text-gray-600">{error}</div>
          <button
            onClick={loadDashboard}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">Crew Time Tracking</h1>
          <p className="text-gray-600 mt-1">
            Real-time view of who's working, hours tracked, and potential issues
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-gray-600">Currently Clocked In</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.active_clock_ins.length}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-green-600" />
              <span className="text-sm text-gray-600">Active Jobs Today</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.hours_per_job_today.length}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <span className="text-sm text-gray-600">Total Hours Today</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {formatDuration(
                data.hours_per_job_today.reduce((sum, job) => sum + job.total_hours, 0)
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-gray-600">Flags</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.flags.clock_ins_outside_radius.length +
                data.flags.missing_clock_outs.length}
            </div>
          </div>
        </div>

        {/* Who is Clocked In Right Now */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Currently Clocked In ({data.active_clock_ins.length})
          </h2>
          {data.active_clock_ins.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No one is currently clocked in</div>
          ) : (
            <div className="space-y-3">
              {data.active_clock_ins.map((clock) => {
                const startTime = new Date(clock.clock_in);
                const now = Date.now();
                const minutesElapsed = Math.floor((now - startTime.getTime()) / 60000);
                const hours = Math.floor(minutesElapsed / 60);
                const mins = minutesElapsed % 60;

                return (
                  <div
                    key={clock.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {clock.employee.first_name} {clock.employee.last_name}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {clock.job.notes || "Job #" + clock.job.id.slice(0, 8)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Clocked in: {startTime.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">
                          {hours}h {mins}m
                        </div>
                        <div className="text-xs text-gray-500">on site</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hours Per Job Today */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Hours Per Job Today</h2>
          {data.hours_per_job_today.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No hours logged today</div>
          ) : (
            <div className="space-y-3">
              {data.hours_per_job_today.map((job) => (
                <div
                  key={job.job_id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{job.job_name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {job.employee_count} employee{job.employee_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {formatDuration(job.total_hours)}
                      </div>
                      <div className="text-xs text-gray-500">total hours</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hours Per Employee This Week */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Hours Per Employee This Week</h2>
          {data.hours_per_employee_week.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No hours logged this week</div>
          ) : (
            <div className="space-y-3">
              {data.hours_per_employee_week
                .sort((a, b) => b.total_hours - a.total_hours)
                .map((emp) => (
                  <div
                    key={emp.employee_id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-gray-900">{emp.employee_name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {emp.job_count} job{emp.job_count !== 1 ? "s" : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-gray-900">
                          {formatDuration(emp.total_hours)}
                        </div>
                        <div className="text-xs text-gray-500">this week</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Flags */}
        {(data.flags.clock_ins_outside_radius.length > 0 ||
          data.flags.missing_clock_outs.length > 0) && (
          <div className="bg-white rounded-xl p-6 shadow-sm border-2 border-yellow-200">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <h2 className="text-xl font-bold text-gray-900">Flags & Issues</h2>
            </div>

            {data.flags.clock_ins_outside_radius.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Clock-Ins Outside Radius ({data.flags.clock_ins_outside_radius.length})
                </h3>
                <div className="space-y-2">
                  {data.flags.clock_ins_outside_radius.map((flag) => (
                    <div
                      key={flag.id}
                      className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="w-4 h-4 text-yellow-600" />
                        <span className="font-medium text-gray-900">{flag.employee_name}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {flag.job_name} • {new Date(flag.clock_in).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.flags.missing_clock_outs.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">
                  Missing Clock-Outs ({data.flags.missing_clock_outs.length})
                </h3>
                <div className="space-y-2">
                  {data.flags.missing_clock_outs.map((flag) => (
                    <div
                      key={flag.id}
                      className="bg-red-50 border border-red-200 rounded-lg p-3"
                    >
                      <div className="font-medium text-gray-900">
                        {flag.employee?.first_name} {flag.employee?.last_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {flag.job?.notes || "Unknown Job"} • Clocked in:{" "}
                        {new Date(flag.clock_in).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
























