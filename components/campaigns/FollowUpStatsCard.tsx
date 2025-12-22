"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

type FollowUpStats = {
  initial_sent: number;
  follow_ups_sent: number;
  replies_total: number;
  replies_from_followups: number;
  hot_leads: number;
  warm_leads: number;
  not_interested_leads: number;
  reply_rate: number;
  hot_lead_rate: number;
};

type FollowUpStatsCardProps = {
  campaignId: string;
  stats?: FollowUpStats | null;
  loading?: boolean;
};

export function FollowUpStatsCard({ campaignId, stats: externalStats, loading: externalLoading }: FollowUpStatsCardProps) {
  const [internalStats, setInternalStats] = React.useState<FollowUpStats | null>(null);
  const [internalLoading, setInternalLoading] = React.useState(true);

  // Use external stats if provided, otherwise fetch internally
  const stats = externalStats !== undefined ? externalStats : internalStats;
  const loading = externalLoading !== undefined ? externalLoading : internalLoading;

  React.useEffect(() => {
    // Only fetch if stats weren't provided externally
    if (externalStats !== undefined) {
      setInternalLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/follow-up-stats`);
        if (!res.ok) throw new Error("Failed to load stats");
        const data = await res.json();
        setInternalStats(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setInternalLoading(false);
      }
    };
    fetchStats();
  }, [campaignId, externalStats]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Follow-Up Performance</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Follow-Up Performance</CardTitle>
          <CardDescription>
            No data yet. Start sending emails to see results.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const {
    initial_sent,
    follow_ups_sent,
    replies_total,
    hot_leads,
    warm_leads,
    not_interested_leads,
    reply_rate,
    hot_lead_rate,
  } = stats;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Follow-Up Performance</CardTitle>
        <CardDescription>
          See how much SmartSend follow-ups are adding on top of your first
          emails.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Initial emails sent</p>
            <p className="text-xl font-semibold">{initial_sent}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Follow-ups sent</p>
            <p className="text-xl font-semibold">{follow_ups_sent}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total replies</p>
            <p className="text-xl font-semibold">{replies_total}</p>
            <p className="text-[11px] text-muted-foreground">
              Reply rate:{" "}
              <span className="font-medium">{reply_rate.toFixed(1)}%</span>
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Hot lead share</p>
            <p className="text-xl font-semibold">{hot_lead_rate.toFixed(1)}%</p>
            <p className="text-[11px] text-muted-foreground">
              {hot_leads} hot • {warm_leads} warm • {not_interested_leads} not
              interested
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold">What this means:</span> SmartSend
            is turning{" "}
            <span className="font-semibold">{replies_total}</span> replies from{" "}
            <span className="font-semibold">
              {initial_sent + follow_ups_sent}
            </span>{" "}
            emails into{" "}
            <span className="font-semibold">{hot_leads + warm_leads}</span>{" "}
            real opportunities.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

