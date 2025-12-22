// components/dashboard/HotLeadResponseTimeAnalytics.tsx
// Block 97000 — Performance Analytics Component
// Shows response time statistics and gamification

"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

type AnalyticsData = {
  average_response_time_seconds: number;
  average_response_time_minutes: number;
  min_response_time_seconds: number;
  max_response_time_seconds: number;
  total_responses: number;
  responses_under_one_minute: number;
  hot_leads_count: number;
  period_days: number;
};

function fmtDeltaMinutes(deltaMinutes: number) {
  const sign = deltaMinutes > 0 ? "+" : deltaMinutes < 0 ? "−" : "";
  return `${sign}${Math.abs(deltaMinutes)}m`;
}

export function HotLeadResponseTimeAnalytics() {
  const [d7, setD7] = useState<AnalyticsData | null>(null);
  const [d30, setD30] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBoth() {
      try {
        const [r7, r30] = await Promise.all([
          fetch("/api/hot-leads/analytics?days=7"),
          fetch("/api/hot-leads/analytics?days=30"),
        ]);
        if (r7.ok) setD7(await r7.json());
        if (r30.ok) setD30(await r30.json());
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchBoth();
  }, []);

  const compare = useMemo(() => {
    if (!d7 || !d30) return null;
    const delta = (d7.average_response_time_minutes || 0) - (d30.average_response_time_minutes || 0);
    return {
      delta_minutes: delta,
      improving: delta < 0,
      worsening: delta > 0,
    };
  }, [d7, d30]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Response Speed (You)</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!d7 || !d30) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Response Speed (You)
        </CardTitle>
        <CardDescription>
          Last 7 days vs last 30 days. No leaderboards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">Avg response time</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{d7.average_response_time_minutes}</span>
              <span className="text-sm text-muted-foreground">min (7d)</span>
            </div>
            {compare ? (
              <div className="text-xs">
                <span className={compare.improving ? "text-emerald-600" : compare.worsening ? "text-amber-600" : "text-muted-foreground"}>
                  {fmtDeltaMinutes(compare.delta_minutes)} vs 30d
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">Under 1 minute</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{d7.responses_under_one_minute}</span>
              <span className="text-sm text-muted-foreground">of {d7.total_responses}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">Hot leads</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{d7.hot_leads_count}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


























