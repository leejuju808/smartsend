"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function CampaignMetrics({ id }: { id: string }) {
  const [series, setSeries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [top, setTop] = useState<any[]>([]);

  async function load() {
    const [s1, s2] = await Promise.all([
      fetch(`/api/campaigns/${id}/metrics/series`).then(r=>r.json()),
      fetch(`/api/campaigns/${id}/metrics/summary`).then(r=>r.json())
    ]);
    setSeries(s1.series || []);
    setSummary(s2.summary || null);
    setTop(s2.top_domains || []);
  }

  useEffect(()=>{ load(); }, [id]);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Sent (7d)</div>
          <div className="text-xl font-semibold">{summary?.sent_7d ?? 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Unique Opens</div>
          <div className="text-xl font-semibold">{summary?.opens_unique ?? 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Unique Clicks</div>
          <div className="text-xl font-semibold">{summary?.clicks_unique ?? 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Unsubscribes</div>
          <div className="text-xl font-semibold">{summary?.unsub_unique ?? 0}</div>
        </Card>
      </div>

      {/* 7d trends */}
      <Card className="p-4 h-64">
        <div className="text-sm font-medium mb-2">7-Day Trend</div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series}>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="sent" strokeWidth={2} />
            <Line type="monotone" dataKey="replies" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Top domains */}
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Top Domains (30d)</div>
        <div className="grid md:grid-cols-2 gap-2 text-sm">
          {top.map((d:any)=>(
            <div key={d.domain} className="flex items-center justify-between border rounded-md px-3 py-2">
              <div>{d.domain || "—"}</div>
              <div className="text-xs text-muted-foreground">replies {d.replies_30d} / sent {d.sent_30d}</div>
            </div>
          ))}
          {top.length===0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
        </div>
      </Card>
    </div>
  );
}
