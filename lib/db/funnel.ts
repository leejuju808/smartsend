import { createClient } from "@supabase/supabase-js";

export async function getStepFunnel(campaignId: string) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data } = await admin
    .from("v_campaign_step_funnel")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });
  return data ?? [];
}

