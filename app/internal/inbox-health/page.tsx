// app/internal/inbox-health/page.tsx
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// Internal Inbox Health Dashboard

"use client";

import { useState, useEffect } from "react";
import { Activity, TrendingUp, Users, AlertCircle, CheckCircle } from "lucide-react";

interface DashboardData {
  hot_lead_detection_accuracy: number;
  thread_creation_stats: {
    total: number;
    open: number;
    closed: number;
  };
  orphan_reply_count: number;
  inbox_adoption_charts: {
    sessions_over_time: Array<{ date: string; count: number }>;
  };
  top_5_friction_points: Array<{ point: string; count: number }>;
  top_5_requested_improvements: Array<{ improvement: string; count: number }>;
  inbox_stability_score: number;
  mobile_vs_desktop_usage: {
    mobile: number;
    desktop: number;
    mobile_percentage: number;
  };
  booked_estimate_counts: number;
}

export default function InboxHealthDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/internal/inbox-health");
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Failed to load dashboard data");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Inbox Health Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Command center for the product&apos;s success
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Hot Lead Detection Accuracy */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Hot Lead Detection Accuracy
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {data.hot_lead_detection_accuracy.toFixed(1)}%
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Thread Creation Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Thread Creation Stats
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {data.thread_creation_stats.total}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.thread_creation_stats.open} open,{" "}
                  {data.thread_creation_stats.closed} closed
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          {/* Orphan Reply Count */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Orphan Reply Count
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {data.orphan_reply_count}
                </p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertCircle className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </div>

          {/* Inbox Stability Score */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Inbox Stability Score
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {data.inbox_stability_score.toFixed(1)}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <CheckCircle className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top 5 Friction Points */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top 5 Friction Points
            </h2>
            {data.top_5_friction_points.length > 0 ? (
              <div className="space-y-3">
                {data.top_5_friction_points.map((point, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <span className="text-sm text-gray-700">{point.point}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {point.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No friction points reported yet</p>
            )}
          </div>

          {/* Top 5 Requested Improvements */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Top 5 Requested Improvements
            </h2>
            {data.top_5_requested_improvements.length > 0 ? (
              <div className="space-y-3">
                {data.top_5_requested_improvements.map((improvement, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <span className="text-sm text-gray-700">
                      {improvement.improvement.replace(/_/g, " ")}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {improvement.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No improvements requested yet
              </p>
            )}
          </div>
        </div>

        {/* Mobile vs Desktop Usage */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Mobile vs Desktop Usage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded">
              <p className="text-sm font-medium text-gray-600">Mobile</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.mobile_vs_desktop_usage.mobile}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {data.mobile_vs_desktop_usage.mobile_percentage.toFixed(1)}% of total
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded">
              <p className="text-sm font-medium text-gray-600">Desktop</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.mobile_vs_desktop_usage.desktop}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(100 - data.mobile_vs_desktop_usage.mobile_percentage).toFixed(1)}% of total
              </p>
            </div>
            <div className="p-4 bg-purple-50 rounded">
              <p className="text-sm font-medium text-gray-600">Booked Estimates</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {data.booked_estimate_counts}
              </p>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="flex justify-end">
          <button
            onClick={loadDashboardData}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
}



















































