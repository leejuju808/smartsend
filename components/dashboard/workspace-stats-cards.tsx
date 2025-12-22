// components/dashboard/workspace-stats-cards.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_created_at: string;
  total_sent: number;
  total_delivered: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
};

type Props = {
  rows: MetricRow[];
};

export function WorkspaceDashboardStatsCards({ rows }: Props) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.sent += r.total_sent || 0;
      acc.delivered += r.total_delivered || 0;
      acc.opens += r.unique_opens || 0;
      acc.clicks += r.unique_clicks || 0;
      acc.replies += r.unique_replies || 0;
      acc.bounces += r.total_bounces || 0;
      return acc;
    },
    {
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
      replies: 0,
      bounces: 0,
    }
  );

  const pct = (num: number, denom: number) =>
    denom > 0 ? `${Math.round((num / denom) * 100)}%` : "0%";

  const respondingRate = pct(totals.replies, totals.delivered);

  const activeCampaigns = rows.filter((r) => r.total_sent > 0).length;
  const totalCampaigns = rows.length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Homeowners contacted
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{totals.sent}</p>
          <p className="text-[11px] text-muted-foreground">
            Reached: {totals.delivered} • Blocked: {totals.bounces}
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
          <p className="text-2xl font-semibold">{totals.replies}</p>
          <p className="text-[11px] text-muted-foreground">
            Responding rate: {respondingRate}
          </p>
        </CardContent>
      </Card>

      <Card className="border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            City outreach running
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{activeCampaigns}</p>
          <p className="text-[11px] text-muted-foreground">
            Active / total: {activeCampaigns} / {totalCampaigns}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
































































