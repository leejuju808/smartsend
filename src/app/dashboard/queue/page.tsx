"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Clock, XCircle, Activity } from "lucide-react";

interface QueueStats {
  pending: number;
  processing: number;
  sentToday: number;
  failed: number;
  reputation: number;
  backPressureStatus: "normal" | "warning" | "severe" | "critical";
  backPressureThrottle: number;
}

export default function QueueDashboardPage() {
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    sentToday: 0,
    failed: 0,
    reputation: 100,
    backPressureStatus: "normal",
    backPressureThrottle: 1.0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Refresh every 10 seconds
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const res = await fetch("/api/queue/stats");
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to load queue stats:", error);
    } finally {
      setLoading(false);
    }
  }

  const getReputationColor = (reputation: number) => {
    if (reputation >= 80) return "text-green-600";
    if (reputation >= 70) return "text-yellow-600";
    if (reputation >= 60) return "text-orange-600";
    return "text-red-600";
  };

  const getBackPressureBadge = () => {
    switch (stats.backPressureStatus) {
      case "critical":
        return (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
            <AlertCircle className="mr-1 h-4 w-4" />
            Critical - All Campaigns Paused
          </div>
        );
      case "severe":
        return (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
            <AlertCircle className="mr-1 h-4 w-4" />
            Severe - 25% Throttle
          </div>
        );
      case "warning":
        return (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            <AlertCircle className="mr-1 h-4 w-4" />
            Warning - 50% Throttle
          </div>
        );
      default:
        return (
          <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <CheckCircle className="mr-1 h-4 w-4" />
            Normal Operation
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Global Send Queue</h1>
        <p className="text-gray-600">
          Monitor and manage your unified email sending queue across all campaigns
        </p>
      </div>

      {/* Back-Pressure Status */}
      <div className="mb-6">
        <div className="border rounded-lg p-4 bg-white">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-lg flex items-center">
              <Activity className="mr-2 h-5 w-5" />
              System Status
            </h2>
            {getBackPressureBadge()}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Reputation Score</span>
              <span className={`text-lg font-semibold ${getReputationColor(stats.reputation)}`}>
                {stats.reputation}/100
              </span>
            </div>
            {stats.backPressureThrottle < 1.0 && (
              <div className="mt-2 text-sm text-gray-600">
                Sending speed reduced to {Math.round(stats.backPressureThrottle * 100)}% due to reputation concerns
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold text-lg mb-4">Queue Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-4 border rounded-lg bg-blue-50">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-blue-600">{stats.pending}</div>
            <div className="text-xs text-gray-600 mt-1">Pending</div>
          </div>

          <div className="text-center p-4 border rounded-lg bg-yellow-50">
            <div className="flex items-center justify-center mb-2">
              <Activity className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="text-3xl font-bold text-yellow-600">{stats.processing}</div>
            <div className="text-xs text-gray-600 mt-1">Processing</div>
          </div>

          <div className="text-center p-4 border rounded-lg bg-green-50">
            <div className="flex items-center justify-center mb-2">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-600">{stats.sentToday}</div>
            <div className="text-xs text-gray-600 mt-1">Sent Today</div>
          </div>

          <div className="text-center p-4 border rounded-lg bg-red-50">
            <div className="flex items-center justify-center mb-2">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-xs text-gray-600 mt-1">Failed (24h)</div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-6 border rounded-lg p-4 bg-gray-50">
        <h3 className="font-semibold mb-2">How It Works</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• <strong>Priority-based:</strong> High-intent leads and important campaigns send first</li>
          <li>• <strong>Collision prevention:</strong> Same lead won't receive emails within 48 hours</li>
          <li>• <strong>Fair distribution:</strong> Sends are balanced across all active campaigns</li>
          <li>• <strong>Back-pressure:</strong> System automatically slows or pauses when reputation drops</li>
          <li>• <strong>Smart retries:</strong> Failed sends retry with exponential backoff</li>
        </ul>
      </div>
    </div>
  );
}
