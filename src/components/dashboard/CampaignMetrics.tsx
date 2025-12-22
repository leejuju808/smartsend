"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

type SparkRow = { day: string; sent: number; opens: number; clicks: number; unsubscribes: number; replies: number };
type Counters = { sent_24h: number; opens_24h: number; clicks_24h: number; unsubs_24h: number; replies_24h: number };

export function CampaignMetrics({ id, campaignId }: { id?: string; campaignId?: string }) {
  const cid = campaignId || id;
  const [spark, setSpark] = useState<SparkRow[]>([]);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [topLinks, setTopLinks] = useState<{ url: string; clicks: number }[]>([]);
  const [replyRate, setReplyRate] = useState<number>(0);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      const res = await fetch(`/api/campaigns/${cid}/metrics`, { cache: "no-store" });
      const data = await res.json();
      setSpark(data.spark || []);
      setCounters(data.counters24h || null);
      setTopLinks(data.topLinks || []);
      setReplyRate(data.replyRate7d || 0);
    })();
  }, [cid]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Counters */}
      <div className="xl:col-span-2 grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard title="Sent (24h)" value={counters?.sent_24h ?? 0} />
        <MetricCard title="Opens (24h)" value={counters?.opens_24h ?? 0} />
        <MetricCard title="Clicks (24h)" value={counters?.clicks_24h ?? 0} />
        <MetricCard title="Unsubs (24h)" value={counters?.unsubs_24h ?? 0} />
        <MetricCard title="Replies (24h)" value={counters?.replies_24h ?? 0} />
      </div>

      {/* Reply rate 7d */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Reply Rate (7d)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{(replyRate * 100).toFixed(1)}%</div>
          <p className="text-sm text-muted-foreground mt-1">Replied threads ÷ active threads (7d)</p>
        </CardContent>
      </Card>

      {/* Sparkline */}
      <Card className="xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle>Engagement (7 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="sent" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="opens" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clicks" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="replies" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Sent / Opens / Clicks / Replies over last 7 days</p>
        </CardContent>
      </Card>

      {/* Top links */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Top Links (7d)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {topLinks.length === 0 && <li className="text-sm text-muted-foreground">No clicks yet.</li>}
            {topLinks.map((l, i) => (
              <li key={i} className="flex items-center justify-between">
                <a className="truncate max-w-[75%] underline" href={l.url} target="_blank" rel="noreferrer">
                  {l.url}
                </a>
                <span className="text-sm font-medium tabular-nums">{l.clicks}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

