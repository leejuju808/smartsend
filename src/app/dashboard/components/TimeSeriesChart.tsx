"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

type Row = { d: string; sent: number; unique_opens: number; unique_clicks: number; replies: number; };

export default function TimeSeriesChart({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<Row[]>([]);
  useEffect(() => {
    fetch(`/api/analytics/daily?days=${days}`).then(r => r.json()).then(j => setData(j.series || []));
  }, [days]);

  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm text-gray-500 mb-2">Last {days} days</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopOpacity={0.4}/>
                <stop offset="95%" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="d" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="sent" name="Sent" strokeOpacity={1} fillOpacity={1} fill="url(#g1)" />
            <Area type="monotone" dataKey="unique_opens" name="Opens" strokeOpacity={1} fillOpacity={0.5} />
            <Area type="monotone" dataKey="unique_clicks" name="Clicks" strokeOpacity={1} fillOpacity={0.3} />
            <Area type="monotone" dataKey="replies" name="Replies" strokeOpacity={1} fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}