"use client";

import { CampaignBuilderV2 } from "@/components/campaigns/v2/CampaignBuilderV2";

interface CampaignBuilderV2ClientProps {
  campaignId: string;
  initialCampaign?: {
    id?: string;
    name?: string;
    list_id?: string | null;
    from_email?: string;
    daily_cap?: number;
    send_window_start?: string;
    send_window_end?: string;
    warmup_mode?: boolean;
  };
}

export function CampaignBuilderV2Client({
  campaignId,
  initialCampaign,
}: CampaignBuilderV2ClientProps) {
  return <CampaignBuilderV2 campaignId={campaignId} initialCampaign={initialCampaign} />;
}





















































