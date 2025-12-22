"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type UsageSummary = {
  workspace_id: string;
  workspace_name: string;
  billing_plan: string | null;
  plan_name: string | null;
  daily_send_cap: number | null;
  monthly_send_cap: number | null;
  seat_limit: number | null;
  reply_cap: number | null;
  meeting_cap: number | null;
  seat_count: number;
  sends_today: number;
  replies_today: number;
  meetings_today: number;
  sends_month: number;
  replies_month: number;
  meetings_month: number;

  seats_used_pct: number | null;
  sends_today_pct: number | null;
  sends_month_pct: number | null;
  replies_month_pct: number | null;
  meetings_month_pct: number | null;

  seat_over_limit: boolean;
  sends_today_over_cap: boolean;
  sends_month_over_cap: boolean;
};

type DailyPoint = {
  day: string;
  send_count: number;
  reply_count: number;
  meeting_count: number;
};

export default function BillingUsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [points, setPoints] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChart, setLoadingChart] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/usage/summary");
      const json = await res.json();
      setUsage(json.usage || null);
    } catch (error) {
      console.error("Failed to load usage:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadChart = async () => {
    setLoadingChart(true);
    try {
      const res = await fetch("/api/billing/usage/timeseries");
      const json = await res.json();
      setPoints(json.points || []);
    } catch (error) {
      console.error("Failed to load chart:", error);
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    load();
    loadChart();
  }, []);

  const pill = (over: boolean, pct: number | null | undefined) => {
    if (over) {
      return <Badge className="text-[10px] bg-red-500">Over limit</Badge>;
    }
    if (pct == null) return null;
    if (pct >= 90) {
      return <Badge className="text-[10px] bg-red-500/80">90% used</Badge>;
    }
    if (pct >= 70) {
      return <Badge className="text-[10px] bg-amber-500/80">70% used</Badge>;
    }
    return null;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing Usage</h1>
        <Button
          size="sm"
          onClick={() => {
            // link to Stripe customer portal or upgrade page
            window.location.href = "/dashboard/billing";
          }}
        >
          Manage plan
        </Button>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground">Loading usage…</p>
      )}

      {!loading && !usage && (
        <p className="text-xs text-muted-foreground">
          No usage data found for this workspace.
        </p>
      )}

      {!loading && usage && (
        <>
          {/* Plan & seats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="font-semibold">
                  {usage.plan_name || usage.billing_plan || "Unknown plan"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Workspace: {usage.workspace_name}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Seats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {usage.seat_count}{" "}
                    {usage.seat_limit
                      ? `/ ${usage.seat_limit} seats`
                      : "seats"}
                  </span>
                  {pill(usage.seat_over_limit, usage.seats_used_pct)}
                </div>
                {usage.seats_used_pct != null && (
                  <div className="text-xs text-muted-foreground">
                    {usage.seats_used_pct}% of seat limit used
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Today</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    Sends: <span className="font-semibold">{usage.sends_today}</span>
                    {usage.daily_send_cap
                      ? ` / ${usage.daily_send_cap}`
                      : ""}
                  </span>
                  {pill(usage.sends_today_over_cap, usage.sends_today_pct)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Replies: {usage.replies_today} · Meetings: {usage.meetings_today}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Month to date cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sends (month)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {usage.sends_month}
                    {usage.monthly_send_cap
                      ? ` / ${usage.monthly_send_cap}`
                      : ""}
                  </span>
                  {pill(usage.sends_month_over_cap, usage.sends_month_pct)}
                </div>
                {usage.sends_month_pct != null && (
                  <div className="text-xs text-muted-foreground">
                    {usage.sends_month_pct}% of monthly send cap
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Replies (month)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {usage.replies_month}
                    {usage.reply_cap ? ` / ${usage.reply_cap}` : ""}
                  </span>
                  {pill(false, usage.replies_month_pct)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Replies count is a good signal for ROI.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Meetings (month)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {usage.meetings_month}
                    {usage.meeting_cap ? ` / ${usage.meeting_cap}` : ""}
                  </span>
                  {pill(false, usage.meetings_month_pct)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Meetings booked through SmartSend.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 30-day usage chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Last 30 days</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {loadingChart ? (
                <p className="text-xs text-muted-foreground">
                  Loading usage history…
                </p>
              ) : points.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No usage data yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points}>
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d) =>
                        new Date(d).toLocaleDateString()
                      }
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      labelFormatter={(d) =>
                        new Date(d).toLocaleDateString()
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="send_count"
                      name="Sends"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="reply_count"
                      name="Replies"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="meeting_count"
                      name="Meetings"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}







