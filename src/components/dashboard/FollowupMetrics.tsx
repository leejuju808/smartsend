"use client";

import * as React from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type FollowupMetricsResponse = {
  drafted_7d: number;
  sent_7d: number;
  reply_rate_7d: number;
  daily?: {
    drafted: Array<{ d: string; c: number }>;
    sent: Array<{ d: string; c: number }>;
  };
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function FollowupMetrics({ campaignId }: { campaignId?: string }) {
  const qs = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
  const { data, isLoading } = useSWR<FollowupMetricsResponse>(
    `/api/metrics/followups-7d${qs}`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const drafted = data?.drafted_7d ?? 0;
  const sent = data?.sent_7d ?? 0;
  const rate = data?.reply_rate_7d ?? 0;

  const draftedSeries = data?.daily?.drafted ?? [];
  const sentSeries = data?.daily?.sent ?? [];

  const series = draftedSeries.map((row, index) => {
    const sentRow = sentSeries[index];
    return {
      day: row.d,
      drafted: row.c,
      sent: sentRow?.c ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard title="Follow-ups drafted (7d)" value={isLoading ? "…" : drafted} />
        <MetricCard title="Follow-ups sent (7d)" value={isLoading ? "…" : sent} />
        <MetricCard title="Reply rate from nudges (7d)" value={isLoading ? "…" : `${rate}%`} />
      </div>

      <Card className="border border-zinc-800">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">
            Last 7 days {campaignId ? "(scoped)" : ""}
          </CardTitle>
        </CardHeader>
        <Separator />
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="drafted" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="sent" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className="border border-zinc-800">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="py-6">
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

