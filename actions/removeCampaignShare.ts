"use server";

import { createClient } from "@/lib/supabase/server";
import { getCampaignWithAccess } from "@/lib/smartsend/getCampaignWithAccess";

export async function removeCampaignShare(campaignId: string, userId: string) {
  const supabase = createClient();

  const { user, campaign, role } = await getCampaignWithAccess(campaignId);

  if (!user) throw new Error("Not authenticated");
  if (!campaign) throw new Error("Campaign not found");
  if (role !== "owner") {
    throw new Error("Only the campaign owner can manage sharing.");
  }

  const { error } = await supabase
    .from("smartsend_campaign_shares")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (error) throw error;

  return { ok: true };
}


































































