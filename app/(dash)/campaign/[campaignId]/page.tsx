"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import MeetingAnalyticsCard from "./MeetingAnalyticsCard";
import MeetingGoalsCard from "./MeetingGoalsCard";
import NudgeABCard from "./NudgeABCard";

function Kpi({ label, value, suffix = "" }: { label: string; value: number | string; suffix?: string }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">
          {value}
          {suffix}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDashboard() {
  const { campaignId } = useParams() as { campaignId: string };
  const [kpis, setKpis] = React.useState<any | null>(null);
  const [series, setSeries] = React.useState<any[]>([]);
  const [days, setDays] = React.useState<number>(14);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [a, b] = await Promise.all([
        fetch(`/api/campaign/${campaignId}/metrics`).then((r) => r.json()),
        fetch(`/api/campaign/${campaignId}/series`).then((r) => r.json()),
      ]);
      if (!mounted) return;
      setKpis(a.kpis ?? null);
      setSeries((b.series ?? []).slice(-days));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [campaignId, days]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Campaign Dashboard</div>
          <div className="text-sm text-muted-foreground">{kpis?.name ?? ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={days === 14 ? "default" : "outline"} onClick={() => setDays(14)}>
            14d
          </Button>
          <Button variant={days === 30 ? "default" : "outline"} onClick={() => setDays(30)}>
            30d
          </Button>
          <Button variant={days === 90 ? "default" : "outline"} onClick={() => setDays(90)}>
            90d
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Kpi label="Sent" value={kpis?.sent ?? 0} />
            <Kpi label="Replies" value={kpis?.replies ?? 0} />
            <Kpi label="Opens" value={kpis?.opens ?? 0} />
            <Kpi label="Clicks" value={kpis?.clicks ?? 0} />
            <Kpi label="Reply Rate" value={kpis?.reply_rate_pct ?? 0} suffix="%" />
            <Kpi label="Bounce Rate" value={kpis?.bounce_rate_pct ?? 0} suffix="%" />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2 text-sm text-muted-foreground">Last {days} days</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <XAxis dataKey="d" tickFormatter={(d) => new Date(d).toLocaleDateString()} />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={(d) => new Date(d as string).toLocaleDateString()} />
                    <Legend />
                    <Line type="monotone" dataKey="sent" dot={false} />
                    <Line type="monotone" dataKey="replies" dot={false} />
                    <Line type="monotone" dataKey="opens" dot={false} />
                    <Line type="monotone" dataKey="clicks" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Last Sent</div>
                <div className="text-sm">
                  {kpis?.last_sent_at ? new Date(kpis.last_sent_at).toLocaleString() : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Last Inbound</div>
                <div className="text-sm">
                  {kpis?.last_inbound_at ? new Date(kpis.last_inbound_at).toLocaleString() : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Threads</div>
                <div className="text-2xl font-semibold">{kpis?.threads ?? 0}</div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <div className="grid gap-3">
        <MeetingAnalyticsCard campaignId={campaignId} />
        <MeetingGoalsCard campaignId={campaignId} />
        <NudgeABCard campaignId={campaignId} />
      </div>
    </div>
  );
}



