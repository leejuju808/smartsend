"use client";

import * as React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

export function SeriesChart({ series }: { series: Array<any> }) {
  const data = (series ?? []).map((r) => ({
    d: new Date(r.d).toLocaleDateString(),
    Sends: r.sends,
    Replies: r.replies,
    Opens: r.opens,
    Bounces: r.bounces,
  }));

  return (
    <div className="h-72 w-full rounded-xl border p-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="d" minTickGap={24} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Sends" dot={false} />
          <Line type="monotone" dataKey="Replies" dot={false} />
          <Line type="monotone" dataKey="Opens" dot={false} />
          <Line type="monotone" dataKey="Bounces" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


