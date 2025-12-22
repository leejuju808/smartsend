// src/app/dashboard/campaigns/actions.ts
"use server";

import { getServerSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCampaignAndQueue({
  workspaceId,
  name,
  scheduledFor, // ISO string in user's TZ -> convert to UTC in client or here
  recipients,   // Array<{ email, subject, body, variables? }>
}: {
  workspaceId: string;
  name: string;
  scheduledFor: string;
  recipients: Array<{ email: string; subject: string; body: string; variables?: any }>;
}) {
  const supabase = getServerSupabase();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Verify workspace access
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (workspaceError || !workspace) {
    throw new Error("Workspace not found or access denied");
  }

  // Create campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: workspaceId,
      name,
      scheduled_for: scheduledFor,
      status: "scheduled",
    })
    .select("*")
    .single();

  if (campaignError) {
    throw new Error(`Failed to create campaign: ${campaignError.message}`);
  }

  // Create campaign recipients
  const recipientRows = recipients.map((r) => ({
    campaign_id: campaign.id,
    recipient: r.email,
    subject: r.subject,
    body: r.body,
    variables: r.variables ?? {},
    scheduled_at: scheduledFor, // override per-recipient if needed
    status: "queued",
  }));

  const { error: recipientsError } = await supabase
    .from("campaign_recipients")
    .insert(recipientRows);

  if (recipientsError) {
    // Clean up campaign if recipients failed
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    throw new Error(`Failed to create recipients: ${recipientsError.message}`);
  }

  // Revalidate the campaigns page
  revalidatePath("/dashboard/campaigns");

  return { 
    id: campaign.id, 
    message: `Campaign "${name}" scheduled with ${recipients.length} recipients` 
  };
}

export async function getCampaigns(workspaceId: string) {
  const supabase = getServerSupabase();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Get current org_id from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .single();

  // Get campaigns with recipient counts, filtered by org if current_org_id is set
  let campaignsQuery = supabase
    .from("campaigns")
    .select(`
      *,
      campaign_recipients(count),
      campaign_emails(sequence_order)
    `)
    .eq("workspace_id", workspaceId);
  
  // Filter by org: if current_org_id set → show campaigns where org_id = current_org_id or owned-only if null
  if (profile?.current_org_id) {
    campaignsQuery = campaignsQuery.or(`org_id.eq.${profile.current_org_id},user_id.eq.${user.id}`);
  } else {
    // If no current org, show only owned campaigns
    campaignsQuery = campaignsQuery.eq("user_id", user.id);
  }
  
  const { data: campaigns, error: campaignsError } = await campaignsQuery.order("created_at", { ascending: false });

  if (campaignsError) {
    throw new Error(`Failed to fetch campaigns: ${campaignsError.message}`);
  }

  // Add auto_followup_active flag based on campaign_emails count
  const campaignsWithFollowup = campaigns?.map((campaign: any) => {
    const hasMultipleSequences = campaign.campaign_emails && campaign.campaign_emails.length > 1;
    const maxSequenceOrder = campaign.campaign_emails?.reduce((max: number, ce: any) => 
      Math.max(max, ce.sequence_order || 1), 1
    ) || 1;
    return {
      ...campaign,
      auto_followup_active: hasMultipleSequences || maxSequenceOrder > 1
    };
  });

  return campaignsWithFollowup || [];
}

export async function getCampaignDetails(campaignId: string) {
  const supabase = getServerSupabase();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Get campaign with recipients
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select(`
      *,
      campaign_recipients(*)
    `)
    .eq("id", campaignId)
    .single();

  if (campaignError) {
    throw new Error(`Failed to fetch campaign: ${campaignError.message}`);
  }

  // Verify workspace access
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (workspaceError || !workspace) {
    throw new Error("Campaign not found or access denied");
  }

  return campaign;
}

export async function cancelCampaign(campaignId: string) {
  const supabase = getServerSupabase();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Get campaign to verify access
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .single();

  if (campaignError) {
    throw new Error(`Campaign not found: ${campaignError.message}`);
  }

  // Verify workspace access
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", campaign.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (workspaceError || !workspace) {
    throw new Error("Campaign not found or access denied");
  }

  // Cancel campaign and update queued recipients
  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "canceled" })
    .eq("id", campaignId);

  if (updateError) {
    throw new Error(`Failed to cancel campaign: ${updateError.message}`);
  }

  // Mark queued recipients as failed
  await supabase
    .from("campaign_recipients")
    .update({ 
      status: "failed", 
      error: "Campaign canceled" 
    })
    .eq("campaign_id", campaignId)
    .eq("status", "queued");

  // Revalidate the campaigns page
  revalidatePath("/dashboard/campaigns");

  return { message: "Campaign canceled successfully" };
}