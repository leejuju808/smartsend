"use client";

import * as React from "react";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

type Point = { d: string; sends: number; replies: number };

export function Spark({ points, k = "sends" }: { points: Point[]; k?: "sends" | "replies" }) {
  const data = (points ?? []).map((p) => ({
    x: p.d,
    y: k === "sends" ? p.sends : p.replies,
  }));

  if (!data.length) {
    return <div className="h-8 w-24" />;
  }

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="y" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


