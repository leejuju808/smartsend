"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Separator } from "@/components/ui/separator";
import { ActivitySpark } from "./charts/ActivitySpark";
import { TopCampaigns } from "./tables/TopCampaigns";

type Dash = {
  totals: { sent: number; opens: number; clicks: number; replies: number };
  activity: Array<{ t: string; sent: number; opened: number; clicked: number; replied: number }>;
  top_campaigns: Array<{
    campaign_id: string; campaign_name: string | null;
    delivered: number; opens: number; clicks: number; replies: number;
    open_rate: number; click_rate: number; reply_rate: number;
  }>;
  generated_at: string;
};

export default function OverviewClient({ initial }: { initial: Dash | null }) {
  const supabase = React.useMemo(() => createBrowserClient(), []);
  const [data, setData] = React.useState<Dash | null>(initial);
  const [loading, setLoading] = React.useState(false);

  const refetch = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  // Realtime: on new campaign_events → refetch
  React.useEffect(() => {
    const ch = supabase
      .channel("dash-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "campaign_events" }, refetch)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, refetch]);

  if (!data) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  const { totals, activity, top_campaigns } = data;

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Sent" value={totals.sent} />
        <StatCard label="Opens" value={totals.opens} />
        <StatCard label="Clicks" value={totals.clicks} />
        <StatCard label="Replies" value={totals.replies} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 24h Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Last 24 Hours</CardTitle>
            <button onClick={refetch} className="text-xs text-muted-foreground hover:underline">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </CardHeader>
          <CardContent>
            <ActivitySpark data={activity} />
          </CardContent>
        </Card>

        {/* Top Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <TopCampaigns rows={top_campaigns} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}