"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from "recharts";
import { createBrowserClient } from "@supabase/ssr";

function getSupabaseClient() {
  if (typeof window === "undefined") return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MetricsPage() {
  const [accountId, setAccountId] = useState<string>("");
  const [overview, setOverview] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [topErrors, setTopErrors] = useState<any[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const to = new Date();
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  async function fetchOverview() {
    if (!accountId) return;
    const url = `/api/metrics/overview?accountId=${accountId}${provider ? `&provider=${provider}` : ""}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.ok) setOverview(j.data);
  }

  async function fetchSeries() {
    if (!accountId) return;
    const url = `/api/metrics/timeseries?accountId=${accountId}&from=${range.from}&to=${range.to}${provider ? `&provider=${provider}` : ""}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.ok) setSeries(j.data);
  }

  async function fetchHeatmap() {
    if (!accountId) return;
    const r = await fetch(`/api/metrics/heatmap?accountId=${accountId}`);
    const j = await r.json();
    if (j.ok) setHeatmap(j.data);
  }

  async function fetchTopErrors() {
    if (!accountId) return;
    const r = await fetch(`/api/metrics/errors?accountId=${accountId}&limit=5`);
    const j = await r.json();
    if (j.ok) setTopErrors(j.data);
  }

  useEffect(() => {
    if (!accountId) return;
    fetchOverview();
    fetchSeries();
    fetchHeatmap();
    fetchTopErrors();

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Realtime: refresh when queue/events change (throttled)
    let timeout: NodeJS.Timeout;
    const refresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        fetchOverview();
        fetchSeries();
        fetchHeatmap();
        fetchTopErrors();
      }, 1000); // 1s debounce
    };

    const sub1 = supabase
      .channel("queue-metrics")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "send_queue" },
        refresh
      )
      .subscribe();
    const sub2 = supabase
      .channel("event-metrics")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "provider_event_logs" },
        refresh
      )
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(sub1);
      supabase.removeChannel(sub2);
    };
  }, [accountId, range.from, range.to, provider]);

  const totals = useMemo(() => {
    let sent = 0,
      failed = 0,
      dead = 0,
      bounces = 0,
      complaints = 0;
    for (const p of series) {
      sent += p.sent || 0;
      failed += p.failed || 0;
      dead += p.dead || 0;
      bounces += p.bounces || 0;
      complaints += p.complaints || 0;
    }
    return { sent, failed, dead, bounces, complaints };
  }, [series]);

  const successRate = useMemo(() => {
    if (!overview) return 0;
    const total = (overview.sent_today || 0) + (overview.failed_today || 0) + (overview.dead_today || 0);
    if (total === 0) return 0;
    return ((overview.sent_today || 0) / total * 100).toFixed(1);
  }, [overview]);

  // Prepare heatmap data (7 days x 24 hours)
  const heatmapData = useMemo(() => {
    const grid: { [key: string]: { sent: number; failed: number } } = {};
    heatmap.forEach((h: any) => {
      const key = `${h.dow}-${h.hour}`;
      grid[key] = { sent: h.sent || 0, failed: h.failed || 0 };
    });
    return grid;
  }, [heatmap]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium">Account ID</label>
          <Input
            placeholder="uuid..."
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="min-w-[150px]">
          <label className="text-sm font-medium">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All Providers</option>
            <option value="gmail">Gmail</option>
            <option value="outlook">Outlook</option>
            <option value="generic">Generic</option>
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="text-sm font-medium">From</label>
          <Input
            type="datetime-local"
            value={range.from.slice(0, 16)}
            onChange={(e) =>
              setRange((r) => ({
                ...r,
                from: new Date(e.target.value).toISOString(),
              }))
            }
            className="mt-1"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="text-sm font-medium">To</label>
          <Input
            type="datetime-local"
            value={range.to.slice(0, 16)}
            onChange={(e) =>
              setRange((r) => ({
                ...r,
                to: new Date(e.target.value).toISOString(),
              }))
            }
            className="mt-1"
          />
        </div>
        <Button
          onClick={() => {
            fetchOverview();
            fetchSeries();
            fetchHeatmap();
            fetchTopErrors();
          }}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sent (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {overview?.sent_today ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-500">
            {overview?.failed_today ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Dead Letters (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-orange-500">
            {overview?.dead_today ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bounces (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-yellow-500">
            {overview?.bounces_today ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Complaints (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-600">
            {overview?.complaints_today ?? 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success Rate (24h)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-green-500">
            {successRate}%
          </CardContent>
        </Card>
      </div>

      <Card className="p-4">
        <CardHeader>
          <CardTitle>Throughput (Hourly)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={series.map((d) => ({
                  ...d,
                  label: formatDate(new Date(d.ts)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="sent" dot={false} stroke="#8884d8" />
                <Line type="monotone" dataKey="failed" dot={false} stroke="#82ca9d" />
                <Line type="monotone" dataKey="dead" dot={false} stroke="#ffc658" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="p-4">
        <CardHeader>
          <CardTitle>Error Mix (Hourly)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={series.map((d) => ({
                  ...d,
                  label: formatDate(new Date(d.ts)),
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" minTickGap={24} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="bounces" stackId="e" fill="#8884d8" name="Bounces" />
                <Bar dataKey="complaints" stackId="e" fill="#82ca9d" name="Complaints" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card className="p-4">
        <CardHeader>
          <CardTitle>Send Activity Heatmap (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid gap-1" style={{ gridTemplateColumns: "60px repeat(24, minmax(32px, 1fr))" }}>
                {/* Header row */}
                <div className="text-xs font-medium p-2"></div>
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="text-xs text-center p-1 font-medium">
                    {i}
                  </div>
                ))}
                {/* Data rows */}
                {DAYS.map((day, dow) => (
                  <React.Fragment key={dow}>
                    <div className="text-xs font-medium p-2 flex items-center">
                      {day}
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const key = `${dow + 1}-${hour}`;
                      const data = heatmapData[key] || { sent: 0, failed: 0 };
                      const total = data.sent + data.failed;
                      const intensity = total > 0 ? Math.min(total / 10, 1) : 0; // Normalize to 0-1
                      const bgColor = data.failed > 0
                        ? `rgba(239, 68, 68, ${0.3 + intensity * 0.7})` // Red for failures
                        : `rgba(34, 197, 94, ${0.3 + intensity * 0.7})`; // Green for success
                      return (
                        <div
                          key={`${dow}-${hour}`}
                          className="w-8 h-8 rounded border border-gray-300"
                          style={{ backgroundColor: bgColor }}
                          title={`${day} ${hour}:00 - Sent: ${data.sent}, Failed: ${data.failed}`}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border border-gray-300 bg-green-200"></div>
              <span>Success</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border border-gray-300 bg-red-200"></div>
              <span>Failures</span>
            </div>
            <span className="ml-4">Darker = More activity</span>
          </div>
        </CardContent>
      </Card>

      {/* Top Error Reasons */}
      {topErrors.length > 0 && (
        <Card className="p-4">
          <CardHeader>
            <CardTitle>Top 5 Error Reasons (Last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Error Reason</th>
                    <th className="text-right p-2 font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {topErrors.map((error: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2 font-mono text-xs">{error.error_reason}</td>
                      <td className="p-2 text-right font-semibold">{error.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

