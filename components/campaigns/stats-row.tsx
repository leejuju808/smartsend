"use client";

import { Card, CardContent } from "@/components/ui/card";

interface DailyStat {
  day: string;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  meetings: number;
}

interface StatsRowProps {
  stats: DailyStat[];
}

export function StatsRow({ stats }: StatsRowProps) {
  const totals = stats.reduce(
    (acc, s) => ({
      sends: acc.sends + (s.sends || 0),
      opens: acc.opens + (s.opens || 0),
      clicks: acc.clicks + (s.clicks || 0),
      replies: acc.replies + (s.replies || 0),
      meetings: acc.meetings + (s.meetings || 0),
    }),
    { sends: 0, opens: 0, clicks: 0, replies: 0, meetings: 0 }
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard title="Sends" value={totals.sends} />
      <KpiCard title="Opens" value={totals.opens} />
      <KpiCard title="Clicks" value={totals.clicks} />
      <KpiCard title="Replies" value={totals.replies} />
      <KpiCard title="Meetings" value={totals.meetings} />
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}










