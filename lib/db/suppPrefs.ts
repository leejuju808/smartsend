import { createClient } from "@supabase/supabase-js";

type SuppPrefs = {
  respect_global_suppressions?: boolean;
  respect_cross_campaign_unsubs?: boolean;
  respect_domain_blocks?: boolean;
};

export async function getSuppPrefs(campaignId: string) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await admin
    .from("campaigns")
    .select(
      "respect_global_suppressions,respect_cross_campaign_unsubs,respect_domain_blocks"
    )
    .eq("id", campaignId)
    .single();

  if (error) {
    throw error;
  }

  return data!;
}

export async function setSuppPrefs(
  campaignId: string,
  prefs: SuppPrefs
) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await admin
    .from("campaigns")
    .update(prefs)
    .eq("id", campaignId);

  if (error) {
    throw error;
  }
}












