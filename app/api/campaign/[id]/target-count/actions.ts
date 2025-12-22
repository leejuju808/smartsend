"use server";

import { createClient } from "@/utils/supabase/server";
import { filterLeadsBySegment } from "@/utils/segments/filter";

export async function getCampaignTargetCount(campaignId: string) {
  const supabase = createClient();

  // 1) Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, account_id, segment_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  // 2) If campaign has a segment_id, count using segment filters
  if (campaign.segment_id) {
    // we only need count, not full rows
    const leads = await filterLeadsBySegment(campaign.account_id, campaign.segment_id);
    return { count: leads.length, usingSegment: true };
  }

  // 3) Otherwise, count all leads for this account
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("account_id", campaign.account_id);

  if (error) {
    throw error;
  }

  return { count: count ?? 0, usingSegment: false };
}














