import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const ALLOWED_REASONS = [
  "interested",
  "not_fit",
  "ooo",
  "booked",
  "follow_up_later",
  "uncategorized",
] as const;

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { campaign_lead_ids, reason } = await req.json();

  if (!Array.isArray(campaign_lead_ids) || campaign_lead_ids.length === 0) {
    return NextResponse.json({ error: "campaign_lead_ids array is required" }, { status: 400 });
  }

  if (!ALLOWED_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  // Get current user and workspace
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Verify all campaign_leads belong to workspace
  const { data: campaignLeads, error: verifyError } = await supabase
    .from("campaign_leads")
    .select("id, campaign_id, campaigns!inner(workspace_id)")
    .in("id", campaign_lead_ids)
    .eq("campaigns.workspace_id", workspaceId);

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 500 });
  }

  if (!campaignLeads || campaignLeads.length !== campaign_lead_ids.length) {
    return NextResponse.json({ error: "Some campaign leads not found or access denied" }, { status: 403 });
  }

  // Update all campaign_leads
  const { error } = await supabase
    .from("campaign_leads")
    .update({ last_reply_reason: reason })
    .in("id", campaign_lead_ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}



