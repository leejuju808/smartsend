import { createClient } from "@supabase/supabase-js";

/**
 * Verify that the user (from JWT) can edit the campaign
 * Use this in service routes/edge functions that need to check permissions
 */
export async function assertCanEditCampaign(jwt: string | null, campaignId: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: jwt ? `Bearer ${jwt}` : "" } }
    }
  );

  const { data, error } = await sb.rpc("can_edit_campaign", { 
    p_campaign: campaignId 
  });

  if (error || !data) {
    throw new Error("Forbidden");
  }
}

