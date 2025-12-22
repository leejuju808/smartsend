"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export function SafetyCard({ campaignId }: { campaignId?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [range, setRange] = useState<"7d"|"14d"|"30d">("7d");

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("range", range);
    if (campaignId) p.set("campaign_id", campaignId);
    fetch(`/api/metrics/safety?` + p.toString())
      .then(r => r.json())
      .then(d => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, [campaignId, range]);

  const total = rows.reduce((a, r) => a + (r.total || 0), 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">Safety saves ({range})</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <select
          className="text-sm border rounded-md px-2 py-1"
          value={range}
          onChange={e => setRange(e.target.value as any)}
        >
          <option value="7d">7d</option>
          <option value="14d">14d</option>
          <option value="30d">30d</option>
        </select>
      </div>

      <div className="h-40 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tickFormatter={(d) => String(d).slice(5)} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="reply_stop" name="Stop on Reply" dot={false} />
            <Line type="monotone" dataKey="suppression" name="Suppression" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

