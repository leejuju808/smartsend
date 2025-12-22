"use client";

import { Card, CardContent } from "@/components/ui/Card";
import type { CampaignDailyDelivery, CampaignDeliveryTotals } from "@/lib/db/campaignStats";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface DeliveryTilesProps {
  totals: CampaignDeliveryTotals | null;
  daily: CampaignDailyDelivery[];
}

export default function DeliveryTiles({ totals, daily }: DeliveryTilesProps) {
  const tiles = [
    { label: "Sent", value: totals?.attempts ?? 0 },
    { label: "Delivered", value: totals?.delivered ?? 0 },
    { label: "Bounced", value: totals?.bounced ?? 0 },
    { label: "Complaints", value: totals?.complained ?? 0 },
    { label: "Unsubs", value: totals?.unsubscribed ?? 0 },
    { label: "Replies", value: totals?.replied ?? 0 },
    { label: "Open %", value: formatPercent(totals?.open_rate_pct) },
    { label: "Reply %", value: formatPercent(totals?.reply_rate_pct) },
    { label: "Bounce %", value: formatPercent(totals?.bounce_rate_pct) },
    { label: "Complaint %", value: formatPercent(totals?.complaint_rate_pct) },
    { label: "Unsub %", value: formatPercent(totals?.unsub_rate_pct) },
  ];

  const chartData = daily.map((d) => ({
    ...d,
    day: typeof d.day === "string" ? d.day : new Date(d.day).toISOString().slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="rounded-2xl">
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{tile.label}</div>
              <div className="text-2xl font-semibold">{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="h-64 rounded-2xl">
        <CardContent className="p-4 h-full">
          <div className="text-sm text-muted-foreground mb-2">30-day Delivery Trend</div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={16} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={false} name="Delivered" />
              <Line type="monotone" dataKey="bounced" stroke="#ef4444" strokeWidth={2} dot={false} name="Bounced" />
              <Line type="monotone" dataKey="complained" stroke="#f97316" strokeWidth={2} dot={false} name="Complaints" />
              <Line type="monotone" dataKey="unsubscribed" stroke="#6366f1" strokeWidth={2} dot={false} name="Unsubs" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "0%";
  }
  return `${value}%`;
}












