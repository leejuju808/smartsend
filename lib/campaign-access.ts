// Permission check helper for campaign access
import { SupabaseClient } from "@supabase/supabase-js";

export async function hasCampaignAccess(
  supabase: SupabaseClient<any>,
  userId: string,
  campaignId: string
): Promise<boolean> {
  // Check if user is a campaign member
  const { data: member } = await supabase
    .from("campaign_members")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (member) return true;

  // Check if user is the campaign owner
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("owner_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) return false;

  return campaign.owner_id === userId;
}










