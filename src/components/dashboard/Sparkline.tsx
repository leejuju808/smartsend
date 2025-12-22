"use client";
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Sparkline({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useSWR(
    `/api/dashboard/metrics?workspace_id=${workspaceId}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  const series = data?.series || [];

  return (
    <div className="rounded-2xl border shadow-sm p-4 bg-white mt-4">
      <div className="text-sm text-gray-500">Last 7 days</div>
      <div className="h-64 mt-2">
        {!isLoading && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="sent" stroke="#8884d8" />
              <Line type="monotone" dataKey="failed" stroke="#82ca9d" />
              <Line type="monotone" dataKey="replied" stroke="#ffc658" />
            </LineChart>
          </ResponsiveContainer>
        )}
        {isLoading && <div className="text-sm text-gray-400">Loading…</div>}
      </div>
    </div>
  );
} 