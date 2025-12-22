import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();

  const { campaign_lead_id, follow_up_at, follow_up_notes } = body;

  if (!campaign_lead_id) {
    return NextResponse.json({ error: "campaign_lead_id is required" }, { status: 400 });
  }

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Get campaign IDs for this workspace
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (campaignsError) {
    return NextResponse.json({ error: campaignsError.message }, { status: 500 });
  }

  const campaignIds = campaigns?.map((c) => c.id) || [];

  // Verify campaign_lead belongs to workspace
  const { data: cl, error: clError } = await supabase
    .from("campaign_leads")
    .select("id, campaign_id, lead_id")
    .eq("id", campaign_lead_id)
    .in("campaign_id", campaignIds)
    .maybeSingle();

  if (clError || !cl) {
    return NextResponse.json({ error: "Campaign lead not found or access denied" }, { status: 404 });
  }

  const { error } = await supabase
    .from("campaign_leads")
    .update({
      follow_up_at: follow_up_at || null,
      follow_up_completed: false,
      follow_up_notes: follow_up_notes ?? null,
      last_reply_reason: "follow_up_later",
    })
    .eq("id", campaign_lead_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log activity
  const { error: activityError } = await supabase
    .from("lead_activity")
    .insert({
      lead_id: cl.lead_id,
      campaign_lead_id: campaign_lead_id,
      activity_type: "follow_up_set",
      activity_data: { follow_up_at },
    });

  if (activityError) {
    // Don't fail the request if activity logging fails, but log it
    console.error("Failed to log activity:", activityError);
  }

  return NextResponse.json({ success: true });
}

