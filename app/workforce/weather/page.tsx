"use client";

// Block 252700 — Real-Time Weather Intelligence Engine
// Office Weather Dashboard
// Shows weather risk for all active jobs with action required indicators

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudRain,
  Wind,
  Thermometer,
  Activity,
} from "lucide-react";

interface JobWeatherStatus {
  job_id: string;
  job_number?: string;
  homeowner_name?: string;
  address?: string;
  risk_level: "normal" | "caution" | "high_risk";
  current_risk_score: number;
  current_heat_index_f?: number;
  current_wind_speed_mph?: number;
  current_rain_probability?: number;
  next_48h_max_risk_score?: number;
  next_48h_worst_conditions?: string;
  production_date?: string;
  scheduled_start_date?: string;
  updated_at: string;
}

export default function WorkforceWeatherDashboard() {
  const [jobs, setJobs] = useState<JobWeatherStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "caution" | "high_risk">("all");

  useEffect(() => {
    fetchWeatherData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchWeatherData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchWeatherData() {
    try {
      setLoading(true);
      const response = await fetch(`/api/weather/dashboard?filter=${filter}`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Error fetching weather dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  function getRiskBadge(riskLevel: string, riskScore: number) {
    if (riskLevel === "high_risk" || riskScore >= 70) {
      return {
        bg: "bg-red-100",
        text: "text-red-800",
        border: "border-red-300",
        label: "HIGH RISK",
        icon: AlertTriangle,
      };
    } else if (riskLevel === "caution" || riskScore >= 40) {
      return {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        border: "border-yellow-300",
        label: "CAUTION",
        icon: AlertTriangle,
      };
    } else {
      return {
        bg: "bg-green-100",
        text: "text-green-800",
        border: "border-green-300",
        label: "NORMAL",
        icon: CheckCircle2,
      };
    }
  }

  function getActionRequired(job: JobWeatherStatus): string | null {
    if (job.risk_level === "high_risk" || (job.current_risk_score || 0) >= 70) {
      if (job.current_rain_probability && job.current_rain_probability >= 60) {
        return "Delay recommended - High rain probability";
      }
      if (job.current_wind_speed_mph && job.current_wind_speed_mph >= 35) {
        return "ACTION REQUIRED - High wind conditions";
      }
      if (job.current_heat_index_f && job.current_heat_index_f >= 103) {
        return "Safety measures required - High heat index";
      }
      return "Review weather conditions";
    }
    if (job.risk_level === "caution") {
      return "Monitor conditions";
    }
    return null;
  }

  const filteredJobs = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "high_risk") return job.risk_level === "high_risk" || (job.current_risk_score || 0) >= 70;
    if (filter === "caution") return job.risk_level === "caution" || ((job.current_risk_score || 0) >= 40 && (job.current_risk_score || 0) < 70);
    return true;
  });

  const highRiskCount = jobs.filter(
    (j) => j.risk_level === "high_risk" || (j.current_risk_score || 0) >= 70
  ).length;
  const cautionCount = jobs.filter(
    (j) => j.risk_level === "caution" || ((j.current_risk_score || 0) >= 40 && (j.current_risk_score || 0) < 70)
  ).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Weather Intelligence Dashboard</h1>
              <p className="text-gray-600 mt-1">
                Real-time weather monitoring for all active jobs
              </p>
            </div>
            <button
              onClick={fetchWeatherData}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Jobs</div>
              <div className="text-3xl font-bold text-gray-900">{jobs.length}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <div className="text-sm text-red-600 mb-1">High Risk</div>
              <div className="text-3xl font-bold text-red-800">{highRiskCount}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <div className="text-sm text-yellow-600 mb-1">Caution</div>
              <div className="text-3xl font-bold text-yellow-800">{cautionCount}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <div className="text-sm text-green-600 mb-1">Normal</div>
              <div className="text-3xl font-bold text-green-800">
                {jobs.length - highRiskCount - cautionCount}
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === "all"
                  ? "bg-orange-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Jobs
            </button>
            <button
              onClick={() => setFilter("caution")}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === "caution"
                  ? "bg-yellow-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Caution ({cautionCount})
            </button>
            <button
              onClick={() => setFilter("high_risk")}
              className={`px-4 py-2 rounded-lg font-medium ${
                filter === "high_risk"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              High Risk ({highRiskCount})
            </button>
          </div>
        </div>

        {/* Jobs Table */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-12">
            <div className="text-center">
              <Activity className="h-8 w-8 animate-spin text-orange-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading weather data...</p>
            </div>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12">
            <div className="text-center text-gray-500">
              No jobs match the current filter.
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Today Risk
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tomorrow Risk
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conditions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action Required
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredJobs.map((job) => {
                  const badge = getRiskBadge(job.risk_level, job.current_risk_score || 0);
                  const BadgeIcon = badge.icon;
                  const action = getActionRequired(job);

                  return (
                    <tr key={job.job_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {job.job_number || `Job #${job.job_id.slice(0, 8)}`}
                          </div>
                          <div className="text-sm text-gray-500">
                            {job.homeowner_name || "Unknown"}
                          </div>
                          {job.address && (
                            <div className="text-xs text-gray-400">{job.address}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text} ${badge.border} border`}
                          >
                            <BadgeIcon className="h-3 w-3" />
                            {badge.label}
                          </span>
                          <span className="text-sm text-gray-600">
                            {(job.current_risk_score || 0)}/100
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {job.next_48h_max_risk_score !== null && job.next_48h_max_risk_score !== undefined
                            ? `${job.next_48h_max_risk_score}/100`
                            : "—"}
                        </div>
                        {job.next_48h_worst_conditions && (
                          <div className="text-xs text-gray-500">
                            {job.next_48h_worst_conditions}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-3 text-sm">
                          {job.current_heat_index_f && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Thermometer className="h-4 w-4" />
                              <span>
                                Heat: {Math.round(job.current_heat_index_f)}°F
                              </span>
                            </div>
                          )}
                          {job.current_wind_speed_mph && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Wind className="h-4 w-4" />
                              <span>{Math.round(job.current_wind_speed_mph)} mph</span>
                            </div>
                          )}
                          {job.current_rain_probability && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <CloudRain className="h-4 w-4" />
                              <span>{Math.round(job.current_rain_probability)}%</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {action ? (
                          <div className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <span className="text-red-700 font-medium">{action}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span>No action needed</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
























