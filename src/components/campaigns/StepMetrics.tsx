"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

type StepRow = { step_no: number; sent_7d: number; replies_7d: number; reply_rate_7d: number };

export function StepMetrics({ id }: { id: string }) {
  const [rows, setRows] = useState<StepRow[]>([]);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/campaigns/${id}/metrics/steps/summary`);
      const j = await r.json();
      if (r.ok) setRows((j.steps || []).map((x:any)=>({
        step_no: x.step_no,
        sent_7d: x.sent_7d || 0,
        replies_7d: x.replies_7d || 0,
        reply_rate_7d: x.reply_rate_7d || 0
      })));
    })();
  }, [id]);

  const data = useMemo(() => rows.map(r => ({
    Step: `Step ${r.step_no}`,
    Sent: r.sent_7d,
    Replies: r.replies_7d,
    "Reply %": Number((r.reply_rate_7d*100).toFixed(1))
  })), [rows]);

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Per-Step Performance (last 7 days)</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="Step" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Sent" />
            <Bar dataKey="Replies" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid md:grid-cols-3 gap-2 text-sm">
        {rows.map(r => (
          <div key={r.step_no} className="flex items-center justify-between border rounded-md px-3 py-2">
            <div className="font-medium">Step {r.step_no}</div>
            <div className="text-xs text-muted-foreground">
              Sent {r.sent_7d} · Replies {r.replies_7d} · {(r.reply_rate_7d*100).toFixed(1)}%
            </div>
          </div>
        ))}
        {rows.length===0 && <div className="text-xs text-muted-foreground">No step data yet.</div>}
      </div>
    </Card>
  );
}
