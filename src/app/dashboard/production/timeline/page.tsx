// Block 64000 — Production Timeline Optimizer Dashboard
// Owner dashboard for production timeline tracking and delay prevention

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSalesModeEnabled } from "@/lib/feature-flags";

interface Timeline {
  id: string;
  job_id: string;
  predicted_start: string;
  predicted_end: string;
  actual_start: string | null;
  actual_end: string | null;
  delay_hours: number;
  delay_severity: string;
  progress_percent: number;
  weather_risk_level: string;
  roofing_jobs?: {
    id: string;
    title: string;
    status: string;
  };
}

interface DelayAlert {
  id: string;
  job_id: string;
  alert_type: string;
  message: string;
  severity: string;
  delay_hours: number;
  created_at: string;
  resolved: boolean;
  roofing_jobs?: {
    id: string;
    title: string;
  };
}

interface CrewEfficiency {
  id: string;
  crew_id: string;
  job_id: string;
  efficiency_percent: number;
  expected_rate: number;
  actual_rate: number;
  crews?: {
    id: string;
    name: string;
  };
  roofing_jobs?: {
    id: string;
    title: string;
  };
}

export default function ProductionTimelinePage() {
  const router = useRouter();
  if (isSalesModeEnabled()) return null;
  const [timelines, setTimelines] = useState<Timeline[]>([]);
  const [alerts, setAlerts] = useState<DelayAlert[]>([]);
  const [efficiencies, setEfficiencies] = useState<CrewEfficiency[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<"timeline" | "alerts" | "efficiency">("timeline");

  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide non-v1 surface area.
    if (isSalesModeEnabled()) {
      router.replace("/dashboard");
      return;
    }
    loadData();
    // Refresh every 60 seconds
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load timelines
      const timelineRes = await fetch("/api/timeline/predict");
      if (timelineRes.ok) {
        // We'll need to create a list endpoint, for now use check-delays
      }

      // Load alerts
      const alertsRes = await fetch("/api/timeline/check-delays");
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts || []);
      }

      // Load efficiencies
      const efficiencyRes = await fetch("/api/timeline/speed-analysis");
      if (efficiencyRes.ok) {
        const data = await efficiencyRes.json();
        setEfficiencies(data.efficiencies || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "info":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getEfficiencyColor = (percent: number) => {
    if (percent >= 100) return "text-green-600";
    if (percent >= 80) return "text-yellow-600";
    return "text-red-600";
  };

  const unresolvedAlerts = alerts.filter(a => !a.resolved);
  const criticalAlerts = unresolvedAlerts.filter(a => a.severity === "critical");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Production Timeline Dashboard
          </h1>
          <p className="text-gray-600">
            Real-time production tracking, delay detection, and crew efficiency monitoring
          </p>
        </div>

        {/* Alert Banner */}
        {criticalAlerts.length > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {criticalAlerts.length} Critical Alert{criticalAlerts.length !== 1 ? "s" : ""} Requiring Immediate Attention
                </h3>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Active Jobs</div>
            <div className="text-2xl font-bold text-gray-900">{timelines.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Unresolved Alerts</div>
            <div className="text-2xl font-bold text-red-600">{unresolvedAlerts.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Critical Alerts</div>
            <div className="text-2xl font-bold text-red-800">{criticalAlerts.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Crew Efficiency</div>
            <div className="text-2xl font-bold text-gray-900">
              {efficiencies.length > 0
                ? Math.round(
                    efficiencies.reduce((sum, e) => sum + (e.efficiency_percent || 0), 0) /
                      efficiencies.length
                  )
                : 0}
              %
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setSelectedView("alerts")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedView === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Delay Alerts ({unresolvedAlerts.length})
            </button>
            <button
              onClick={() => setSelectedView("efficiency")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedView === "efficiency"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Crew Efficiency
            </button>
            <button
              onClick={() => setSelectedView("timeline")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                selectedView === "timeline"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Production Timeline
            </button>
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : (
          <>
            {/* Alerts View */}
            {selectedView === "alerts" && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Active Delay Alerts</h2>
                </div>
                <div className="divide-y divide-gray-200">
                  {unresolvedAlerts.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      No active alerts. All jobs are on track!
                    </div>
                  ) : (
                    unresolvedAlerts.map((alert) => (
                      <div key={alert.id} className="px-6 py-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(
                                  alert.severity
                                )}`}
                              >
                                {alert.severity.toUpperCase()}
                              </span>
                              <span className="text-sm text-gray-500">
                                {alert.alert_type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <h3 className="text-sm font-medium text-gray-900 mb-1">
                              {alert.roofing_jobs?.title || "Job"}
                            </h3>
                            <p className="text-sm text-gray-600">{alert.message}</p>
                            {alert.delay_hours > 0 && (
                              <p className="text-sm text-red-600 mt-1">
                                Delay: {alert.delay_hours.toFixed(1)} hours
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDate(alert.created_at)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Efficiency View */}
            {selectedView === "efficiency" && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Crew Efficiency Tracking</h2>
                </div>
                <div className="divide-y divide-gray-200">
                  {efficiencies.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-500">
                      No efficiency data available yet.
                    </div>
                  ) : (
                    efficiencies.map((eff) => (
                      <div key={eff.id} className="px-6 py-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-gray-900">
                              {eff.crews?.name || "Crew"} - {eff.roofing_jobs?.title || "Job"}
                            </h3>
                            <div className="mt-2 flex items-center space-x-4 text-sm">
                              <span>
                                Expected: {eff.expected_rate?.toFixed(1) || "N/A"} sq/hr
                              </span>
                              <span>
                                Actual: {eff.actual_rate?.toFixed(1) || "N/A"} sq/hr
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-2xl font-bold ${getEfficiencyColor(
                                eff.efficiency_percent || 0
                              )}`}
                            >
                              {Math.round(eff.efficiency_percent || 0)}%
                            </div>
                            <div className="text-xs text-gray-500">Efficiency</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Timeline View */}
            {selectedView === "timeline" && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Production Timeline</h2>
                </div>
                <div className="px-6 py-4 text-center text-gray-500">
                  Timeline view coming soon. Use the API endpoints to fetch timeline data.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}




























