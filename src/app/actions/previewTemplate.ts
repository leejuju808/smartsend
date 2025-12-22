"use server";

import { createClient } from "@/lib/supabase/server";
import { renderTemplate } from "@/lib/smartsend/renderTemplate";

export async function previewTemplate(campaignId: string) {
  const supabase = createClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Get campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  // Get first lead for this campaign
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (leadError || !lead) {
    // Return empty preview if no leads
    return { subject: "", body: "" };
  }

  // Render templates
  const subjectTemplate = campaign.subject || campaign.subject_template || "";
  const bodyTemplate = campaign.body_html || campaign.body_template || campaign.body || "";

  const renderedSubject = renderTemplate(subjectTemplate, lead, campaign);
  const renderedBody = renderTemplate(bodyTemplate, lead, campaign);

  return {
    subject: renderedSubject,
    body: renderedBody,
  };
}


