/**
 * Campaign analytics utilities
 * Provides functions for calculating metrics and retrieving campaign performance data
 */

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export interface CampaignMetrics {
  sent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}

/**
 * Get campaign metrics (sent, open rate, click rate, reply rate)
 */
export async function campaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const supabase = createServerComponentClient({ cookies });

  const [
    { data: sent },
    { data: opened },
    { data: clicked },
    { data: replied },
  ] = await Promise.all([
    supabase.rpc("count_events", { cid: campaignId, etype: "sent" }),
    supabase.rpc("count_distinct_leads_by_type", { cid: campaignId, etype: "open" }),
    supabase.rpc("count_distinct_leads_by_type", { cid: campaignId, etype: "click" }),
    supabase.rpc("count_distinct_leads_by_type", { cid: campaignId, etype: "replied" }),
  ]);

  const sentCount = sent?.[0]?.count ?? 0;
  const openers = opened?.[0]?.count ?? 0;
  const clickers = clicked?.[0]?.count ?? 0;
  const repliers = replied?.[0]?.count ?? 0;

  return {
    sent: sentCount,
    openRate: sentCount ? openers / sentCount : 0,
    clickRate: sentCount ? clickers / sentCount : 0,
    replyRate: sentCount ? repliers / sentCount : 0,
  };
}
