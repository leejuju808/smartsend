"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface QueueStats {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  total: number;
}

interface FunctionStats {
  [fnName: string]: {
    total: number;
    success: number;
    failed: number;
    avgRuntime: number;
    lastRun?: string;
  };
}

interface Throughput {
  hourly: Record<string, number>;
  avg_per_hour: number;
  total_24h: number;
}

interface InfraData {
  queue: QueueStats;
  functions: FunctionStats;
  throughput: Throughput;
  timestamp: string;
}

export default function InfraPage() {
  const [data, setData] = useState<InfraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/infra");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setError(null);
      } else if (res.status === 403) {
        setError("Access denied");
      } else {
        setError("Failed to load infrastructure data");
      }
    } catch (err) {
      console.error("Error fetching infra data:", err);
      setError("Failed to load infrastructure data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading infrastructure metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-lg text-red-600">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-lg">No data available</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Infrastructure Monitoring</h1>
        <div className="text-sm text-gray-500">
          Last updated: {new Date(data.timestamp).toLocaleString()}
        </div>
      </div>

      {/* Send Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-gray-500">Queued</div>
          <div className="text-2xl font-bold text-yellow-600">{data.queue.queued}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Sending</div>
          <div className="text-2xl font-bold text-blue-600">{data.queue.sending}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Sent (24h)</div>
          <div className="text-2xl font-bold text-green-600">{data.queue.sent}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-gray-500">Failed</div>
          <div className="text-2xl font-bold text-red-600">{data.queue.failed}</div>
        </Card>
      </div>

      {/* Throughput */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Send Throughput</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500">Average per Hour</div>
            <div className="text-xl font-bold">{data.throughput.avg_per_hour.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Total (24h)</div>
            <div className="text-xl font-bold">{data.throughput.total_24h}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Estimated Daily Capacity</div>
            <div className="text-xl font-bold">
              {(data.throughput.avg_per_hour * 24).toFixed(0)} sends/day
            </div>
          </div>
        </div>
      </Card>

      {/* Function Performance */}
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Edge Function Performance</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Function</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Success</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Failed</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Avg Runtime</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.functions).map(([fnName, stats]) => (
                <tr key={fnName}>
                  <td className="px-4 py-2 text-sm font-medium">{fnName}</td>
                  <td className="px-4 py-2 text-sm text-right">{stats.total}</td>
                  <td className="px-4 py-2 text-sm text-right text-green-600">{stats.success}</td>
                  <td className="px-4 py-2 text-sm text-right text-red-600">{stats.failed}</td>
                  <td className="px-4 py-2 text-sm text-right">
                    {stats.avgRuntime > 0 ? `${Math.round(stats.avgRuntime)}ms` : "N/A"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {stats.lastRun
                      ? new Date(stats.lastRun).toLocaleString()
                      : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Hourly Throughput Chart */}
      {Object.keys(data.throughput.hourly).length > 0 && (
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Hourly Send Volume</h2>
          <div className="h-64 flex items-end justify-between gap-1">
            {Object.entries(data.throughput.hourly)
              .slice(-24) // Last 24 hours
              .map(([hour, count]) => {
                const maxCount = Math.max(...Object.values(data.throughput.hourly));
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={hour} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${height}%` }}
                      title={`${hour}: ${count} sends`}
                    />
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(hour).getHours()}:00
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}
    </div>
  );
}

