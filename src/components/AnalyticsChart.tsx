"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

type SeriesPoint = { day: string; replies: number; meetings: number; booked: number };

export default function AnalyticsChart({ userId }: { userId: string }) {
  const [data, setData] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<{ mbPer100: number; replies: number; booked: number; replyToMeetingPct: number } | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const res = await fetch(`/api/analytics/summary?user=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      const j = await res.json();
      setData(j.series || []);
      setTotals(j.totals || null);
      setLoading(false);
    };
    run();
  }, [userId]);

  if (loading) return <div className="text-sm text-gray-500">Loading analytics…</div>;

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="MB/100" value={`${totals.mbPer100.toFixed(2)}`} />
          <Kpi label="Replies (30d)" value={`${totals.replies}`} />
          <Kpi label="Booked (30d)" value={`${totals.booked}`} />
          <Kpi label="Reply → Meeting %" value={`${totals.replyToMeetingPct.toFixed(2)}%`} />
        </div>
      )}
      <div className="w-full h-72 rounded-2xl border p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="replies" stroke="#8884d8" dot={false} />
            <Line type="monotone" dataKey="booked" stroke="#82ca9d" dot={false} />
            <Line type="monotone" dataKey="meetings" stroke="#ffc658" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
