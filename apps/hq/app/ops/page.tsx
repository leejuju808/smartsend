"use client";

import { useEffect, useState } from "react";
import { Card } from "@aurev/ui";

interface OpsMetrics {
  open_tickets: number;
  urgent_tickets: number;
  due_renewals: number;
  active_orgs: number;
  retention: number;
  triaged_today: number;
  avg_response_time_minutes: number;
}

export default function OpsPage() {
  const [data, setData] = useState<OpsMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/ops-metrics");
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const json = await res.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading ops metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Error loading metrics</p>
      </div>
    );
  }

  const metrics = data || {
    open_tickets: 0,
    urgent_tickets: 0,
    due_renewals: 0,
    active_orgs: 0,
    retention: 0,
    triaged_today: 0,
    avg_response_time_minutes: 0,
  };

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Operations Dashboard</h1>
        <p className="text-gray-400">
          Real-time view of support, billing, and customer success metrics
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">Open Tickets</h3>
            {metrics.urgent_tickets > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {metrics.urgent_tickets} urgent
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-amber-400">{metrics.open_tickets}</p>
          <p className="text-sm text-gray-400 mt-2">
            {metrics.triaged_today} triaged today
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Upcoming Renewals</h3>
          <p className="text-3xl font-bold text-blue-400">{metrics.due_renewals}</p>
          <p className="text-sm text-gray-400 mt-2">
            Next 7 days
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Org Retention</h3>
          <p className="text-3xl font-bold text-green-400">{metrics.retention}%</p>
          <p className="text-sm text-gray-400 mt-2">
            {metrics.active_orgs} active orgs
          </p>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-2">Response Time</h3>
          <p className="text-3xl font-bold text-purple-400">
            {metrics.avg_response_time_minutes > 0
              ? `${metrics.avg_response_time_minutes}m`
              : "N/A"}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Average time to resolution (today)
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold text-white mb-2">AI Triage Performance</h3>
          <p className="text-3xl font-bold text-indigo-400">
            {metrics.triaged_today}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Tickets triaged today
          </p>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-surface border border-gray-800 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Automation Status</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            <span className="text-gray-300">Support Bot (AI Triage)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            <span className="text-gray-300">Billing Reminders</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            <span className="text-gray-300">Customer Success Check-ins</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            <span className="text-gray-300">Slack/Discord Notifications</span>
          </div>
        </div>
      </div>
    </div>
  );
}

