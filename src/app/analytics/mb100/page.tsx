"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";

// Recharts must be client-side
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });
const LineChart = dynamic(() => import("recharts").then(m => m.LineChart), { ssr: false });
const Line = dynamic(() => import("recharts").then(m => m.Line), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });

type MBResp = {
  periodDays: number;
  totals: { replies: number; meetings: number; mb100: number };
  daily: { date: string; replies: number; meetings: number; mb100: number }[];
};

export default function MB100AnalyticsPage() {
  const [workspaceId, setWorkspaceId] = React.useState("");
  const [period, setPeriod] = React.useState(30);
  const [data, setData] = React.useState<MBResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function fetchMB() {
    if (!workspaceId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/analytics/mb100?workspaceId=${workspaceId}&period=${period}`);
      const json = (await res.json()) as MBResp;
      if (!res.ok) throw new Error((json as any).error || "Failed to load");
      setData(json);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    fetchMB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, period]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">MB/100 Analytics</h1>

      <Card>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Workspace ID</label>
            <Input placeholder="00000000-0000-0000-0000-000000000000" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Period (days)</label>
            <Input type="number" min={7} max={90} value={period} onChange={(e) => setPeriod(parseInt(e.target.value || "30"))} />
          </div>
        </CardContent>
      </Card>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {data && (
        <>
          <Card>
            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">MB/100 (period)</div>
                <div className="text-3xl font-semibold">{data.totals.mb100.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Replies</div>
                <div className="text-3xl font-semibold">{data.totals.replies}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Meetings</div>
                <div className="text-3xl font-semibold">{data.totals.meetings}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm mb-2">MB/100 Trend (last {data.periodDays} days)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="mb100" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}