// Block 8100 - SmartSend Manual Enqueue Action
// Allows user to re-run a failed send or manually enqueue a lead

"use server";

import { getServerSupabase } from "@/lib/supabase/server";

export async function enqueueLead(campaignId: string, leadId: string) {
  const supabase = await getServerSupabase();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Verify campaign access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, user_id, workspace_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  // Check if user has access to this campaign
  // (either owns it or is in the workspace)
  let hasAccess = false;
  if (campaign.user_id === user.id) {
    hasAccess = true;
  } else if (campaign.workspace_id) {
    const { data: member } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    hasAccess = !!member;
  }

  if (!hasAccess) {
    throw new Error("Access denied");
  }

  // Verify lead exists and belongs to campaign
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, campaign_id, email")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  if (lead.campaign_id !== campaignId) {
    throw new Error("Lead does not belong to this campaign");
  }

  // Check if already in queue with pending/processing status
  const { data: existing } = await supabase
    .from("smartsend_queue")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .in("status", ["pending", "processing", "retry"])
    .maybeSingle();

  if (existing) {
    throw new Error("Lead is already queued");
  }

  // Enqueue the lead
  const { error: enqueueError } = await supabase.from("smartsend_queue").insert({
    campaign_id: campaignId,
    lead_id: leadId,
    scheduled_at: new Date().toISOString(),
    status: "pending",
  });

  if (enqueueError) {
    throw new Error(`Failed to enqueue lead: ${enqueueError.message}`);
  }

  return { ok: true, message: `Lead ${lead.email} enqueued successfully` };
}

