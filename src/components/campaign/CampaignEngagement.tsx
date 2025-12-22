"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/Card";

export function CampaignEngagement({ campaignId }: { campaignId: string }) {
  const { data } = useSWR(
    `/api/campaign-metrics?campaign=${campaignId}`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 15000 }
  );

  const d = data || { totalSent: 0, opens: 0, clicks: 0, openRate: 0, clickRate: 0 };

  return (
    <Card className="p-4">
      <div className="font-medium">Engagement (7d)</div>
      <div className="grid grid-cols-4 gap-3 mt-3 text-sm">
        <div>
          <div className="opacity-60">Sent</div>
          <div className="text-lg">{d.totalSent}</div>
        </div>
        <div>
          <div className="opacity-60">Opens</div>
          <div className="text-lg">{d.opens}</div>
        </div>
        <div>
          <div className="opacity-60">Clicks</div>
          <div className="text-lg">{d.clicks}</div>
        </div>
        <div>
          <div className="opacity-60">Open / Click</div>
          <div className="text-lg">{d.openRate}% / {d.clickRate}%</div>
        </div>
      </div>
    </Card>
  );
}














