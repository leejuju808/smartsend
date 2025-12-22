"use client";

import * as React from "react";
import { FollowUpStatsCard } from "@/components/campaigns/FollowUpStatsCard";
import { CampaignMoneyExplainer } from "@/components/campaign/CampaignMoneyExplainer";

type FollowUpStats = {
  initial_sent: number;
  follow_ups_sent: number;
  replies_total: number;
  hot_leads: number;
  warm_leads: number;
  not_interested_leads: number;
  reply_rate: number;
  hot_lead_rate: number;
};

type FollowUpStatsSectionProps = {
  campaignId: string;
};

export function FollowUpStatsSection({ campaignId }: FollowUpStatsSectionProps) {
  const [stats, setStats] = React.useState<FollowUpStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/follow-up-stats`);
        if (!res.ok) throw new Error("Failed to load stats");
        const data = await res.json();
        setStats(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [campaignId]);

  return (
    <div className="space-y-0">
      <FollowUpStatsCard campaignId={campaignId} stats={stats} loading={loading} />
      <CampaignMoneyExplainer stats={stats} />
    </div>
  );
}

