"use client";

import * as React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

type Point = { t: string; sent: number; opened: number; clicked: number; replied: number };

export function ActivitySpark({ data }: { data: Point[] }) {
  // turn ISO-ish string into HH:mm label
  const fmt = (t: string) => new Date(t).toLocaleTimeString([], { hour: "2-digit" });

  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis dataKey="t" tickFormatter={fmt} />
          <YAxis allowDecimals={false} />
          <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString()} />
          <Legend />
          <Line type="monotone" dataKey="sent" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="opened" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="clicked" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="replied" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}