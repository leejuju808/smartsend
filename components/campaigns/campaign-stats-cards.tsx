// components/campaigns/campaign-stats-cards.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Metrics = {
  total_sent: number;
  total_delivered: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  total_bounces: number;
  open_rate: number;   // 0–1
  click_rate: number;  // 0–1
  reply_rate: number;  // 0–1
} | null;

type Props = {
  metrics: Metrics;
};

export function CampaignStatsCards({ metrics }: Props) {
  const m = metrics || {
    total_sent: 0,
    total_delivered: 0,
    unique_opens: 0,
    unique_clicks: 0,
    unique_replies: 0,
    total_bounces: 0,
    open_rate: 0,
    click_rate: 0,
    reply_rate: 0,
  };

  const pct = (x: number) => `${Math.round((x || 0) * 100)}%`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Homeowners contacted
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{m.total_sent}</p>
          <p className="text-[11px] text-muted-foreground">
            Reached: {m.total_delivered} • Blocked: {m.total_bounces}
          </p>
        </CardContent>
      </Card>

      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Homeowners responding
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{m.unique_replies}</p>
          <p className="text-[11px] text-muted-foreground">Responding rate: {pct(m.reply_rate)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
































































