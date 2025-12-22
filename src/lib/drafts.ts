import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getApprovedDrafts(campaignId: string) {
  const { data, error } = await supabase
    .from("email_drafts")
    .select("id, lead_id, subject, body_markdown")
    .eq("campaign_id", campaignId)
    .eq("status", "approved");
  if (error) throw error;
  return data ?? [];
}

export async function getDraftForLead(leadId: string) {
  const { data, error } = await supabase
    .from("email_drafts")
    .select("subject, body_markdown")
    .eq("lead_id", leadId)
    .eq("status", "approved")
    .single();
  if (error) return null;
  return data;
}