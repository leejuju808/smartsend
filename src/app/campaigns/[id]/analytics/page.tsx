"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from "recharts";

type SeriesPoint = {
  day: string;
  sends: number;
  replies: number;
  bounces: number;
  reply_rate_pct: number;
};

type VariantRow = {
  variant_id: string;
  step_no: number;
  name: string;
  enabled: boolean;
  sent: number;
  replies: number;
  reply_rate_pct: number;
};

type Summary = {
  campaign_id: string;
  name: string;
  sent: number;
  replies: number;
  reply_rate_pct: number;
  bounces: number;
  bounce_rate_pct: number;
  avg_ttf_hours: number | null;
  series: SeriesPoint[];
  variants: VariantRow[];
};

export default function CampaignAnalyticsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/functions/v1/analytics-campaign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId }),
        });
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || "Failed to load analytics");
        }
        const data = (await res.json()) as Summary;
        if (mounted) {
          setSummary(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load analytics");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    if (campaignId) {
      load();
    }
    return () => {
      mounted = false;
    };
  }, [campaignId]);

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  if (error || !summary) {
    return <div className="p-6 text-sm text-red-500">{error ?? "Analytics unavailable"}</div>;
  }

  const series: SeriesPoint[] = summary.series ?? [];
  const variants: VariantRow[] = summary.variants ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="Sent" value={summary.sent} />
        <MetricCard label="Replies" value={summary.replies} />
        <MetricCard label="Reply Rate" value={`${summary.reply_rate_pct}%`} />
        <MetricCard label="Bounces" value={summary.bounces} />
        <MetricCard label="Avg TTF (hrs)" value={summary.avg_ttf_hours ?? "—"} />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-2">Last 30 days — Sends vs Replies</div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sends" dot={false} />
                <Line type="monotone" dataKey="replies" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-2">Daily Reply Rate (%)</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="reply_rate_pct" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-2">Variant Performance</div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Step</th>
                  <th>Name</th>
                  <th>Sent</th>
                  <th>Replies</th>
                  <th>Reply %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.variant_id} className="border-t">
                    <td className="py-2">{v.step_no}</td>
                    <td>{v.name}</td>
                    <td>{v.sent}</td>
                    <td>{v.replies}</td>
                    <td>{v.reply_rate_pct}%</td>
                    <td>{v.enabled ? "Enabled" : "Disabled"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}





