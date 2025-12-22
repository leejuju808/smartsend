"use client";

// Block 49000 — SmartSend Roofing Safety Compliance v1
// Owner Dashboard Safety Panel Component
// Shows safety overview, checklists, incidents, and scores

import { useState, useEffect } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Camera,
  FileText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface SafetyOverview {
  missing_checklists_count: number;
  low_score_jobs_count: number;
  recent_incidents_count: number;
  open_incidents_count: number;
  missing_checklists: any[];
  low_score_jobs: any[];
  recent_incidents: any[];
  open_incidents: any[];
}

export function SafetyOverviewPanel() {
  const [overview, setOverview] = useState<SafetyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "incidents" | "scores">("overview");

  useEffect(() => {
    loadSafetyOverview();
  }, []);

  const loadSafetyOverview = async () => {
    try {
      const response = await fetch("/api/safety/daily-scan");
      const data = await response.json();
      if (data.success) {
        setOverview(data);
      }
    } catch (error) {
      console.error("Error loading safety overview:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="text-center text-gray-500">Loading safety overview...</div>
      </div>
    );
  }

  if (!overview) {
    return null;
  }

  const hasAlerts =
    overview.missing_checklists_count > 0 ||
    overview.low_score_jobs_count > 0 ||
    overview.open_incidents_count > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Safety Compliance
              </h2>
              <p className="text-sm text-gray-500">
                OSHA compliance, checklists, and incident tracking
              </p>
            </div>
          </div>
          {hasAlerts && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">
                {overview.missing_checklists_count +
                  overview.low_score_jobs_count +
                  overview.open_incidents_count}{" "}
                Alerts
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === "overview"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("incidents")}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === "incidents"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Incidents ({overview.open_incidents_count})
        </button>
        <button
          onClick={() => setActiveTab("scores")}
          className={`flex-1 px-4 py-3 text-sm font-medium ${
            activeTab === "scores"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Safety Scores
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-yellow-800">
                    Missing Checklists
                  </span>
                  <FileText className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="text-2xl font-bold text-yellow-900">
                  {overview.missing_checklists_count}
                </div>
                <div className="text-xs text-yellow-700 mt-1">
                  Jobs without safety checklist today
                </div>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-red-800">
                    Low Safety Scores
                  </span>
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <div className="text-2xl font-bold text-red-900">
                  {overview.low_score_jobs_count}
                </div>
                <div className="text-xs text-red-700 mt-1">
                  Jobs with score &lt; 80
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-orange-800">
                    Open Incidents
                  </span>
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-2xl font-bold text-orange-900">
                  {overview.open_incidents_count}
                </div>
                <div className="text-xs text-orange-700 mt-1">
                  Requiring attention
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-green-800">
                    Recent Incidents
                  </span>
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {overview.recent_incidents_count}
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Last 7 days
                </div>
              </div>
            </div>

            {/* Missing Checklists */}
            {overview.missing_checklists.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Jobs Missing Safety Checklists
                </h3>
                <div className="space-y-2">
                  {overview.missing_checklists.map((job: any) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {job.title || `Job ${job.id.slice(0, 8)}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          Scheduled: {job.scheduled_start_date || "Today"}
                        </div>
                      </div>
                      <XCircle className="w-5 h-5 text-yellow-600" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Low Score Jobs */}
            {overview.low_score_jobs && overview.low_score_jobs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Jobs with Low Safety Scores
                </h3>
                <div className="space-y-2">
                  {overview.low_score_jobs.map((item: any) => (
                    <div
                      key={item.job_id}
                      className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.roofing_jobs?.title || `Job ${item.job_id.slice(0, 8)}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          Safety Score: {item.score?.toFixed(0) || 0}/100
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-red-600">
                        {item.score?.toFixed(0) || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "incidents" && (
          <div className="space-y-4">
            {overview.open_incidents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p>No open incidents</p>
              </div>
            ) : (
              overview.open_incidents.map((incident: any) => (
                <div
                  key={incident.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          incident.severity === "critical"
                            ? "bg-red-100 text-red-700"
                            : incident.severity === "high"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {incident.severity?.toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {incident.incident_type?.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(incident.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{incident.description}</p>
                  {incident.roofing_jobs && (
                    <div className="text-xs text-gray-500">
                      Job: {incident.roofing_jobs.title || incident.roofing_jobs.id}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "scores" && (
          <div className="space-y-4">
            {overview.low_score_jobs && overview.low_score_jobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-green-500" />
                <p>All jobs have good safety scores</p>
              </div>
            ) : (
              overview.low_score_jobs?.map((item: any) => (
                <div
                  key={item.job_id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-900">
                      {item.roofing_jobs?.title || `Job ${item.job_id.slice(0, 8)}`}
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                      {item.score?.toFixed(0) || 0}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.score >= 80
                          ? "bg-green-500"
                          : item.score >= 60
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${item.score || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Checklist: {item.checklist_score?.toFixed(0) || 0}/60 • Photos:{" "}
                    {item.photo_score?.toFixed(0) || 0}/40
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
































