import { createClient } from "@/lib/supabase/server";

export type CampaignAccessRole = "owner" | "editor" | "viewer" | "none";

export async function getCampaignWithAccess(campaignId: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, campaign: null, role: "none" as CampaignAccessRole };
  }

  // Load campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) {
    return { user, campaign: null, role: "none" as CampaignAccessRole };
  }

  // Owner
  if (campaign.user_id === user.id) {
    return { user, campaign, role: "owner" as CampaignAccessRole };
  }

  // Shared member
  const { data: share } = await supabase
    .from("smartsend_campaign_shares")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!share) {
    return { user, campaign, role: "none" as CampaignAccessRole };
  }

  // share.role is 'viewer' or 'editor'
  return { user, campaign, role: share.role as CampaignAccessRole };
}


































































