// app/api/inbox/reply-reason/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const ALLOWED_REASONS = [
  "interested",
  "not_fit",
  "ooo",
  "booked",
  "follow_up_later",
  "uncategorized",
] as const;

type ReplyReason = (typeof ALLOWED_REASONS)[number];

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();

  const {
    campaign_lead_id,
    reply_event_id, // optional; if null we'll use last_reply_event_id
    reason,
  }: {
    campaign_lead_id: string;
    reply_event_id?: string | null;
    reason: ReplyReason;
  } = body;

  if (!ALLOWED_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  // 1. Make sure this campaign_lead belongs to the current workspace/user
  const { data: cl, error: clError } = await supabase
    .from("campaign_leads")
    .select("id, last_reply_event_id, lead_id, campaign_id")
    .eq("id", campaign_lead_id)
    .maybeSingle();

  if (clError || !cl) {
    return NextResponse.json({ error: "Campaign lead not found" }, { status: 404 });
  }

  // Get workspace to verify access
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

  // Verify campaign belongs to workspace
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", cl.campaign_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found or access denied" }, { status: 403 });
  }

  const effectiveReplyEventId = reply_event_id ?? cl.last_reply_event_id;

  if (!effectiveReplyEventId) {
    return NextResponse.json({ error: "No reply event to tag" }, { status: 400 });
  }

  // 2. Update email_events.reply_reason
  const { error: evError } = await supabase
    .from("email_events")
    .update({ reply_reason: reason })
    .eq("id", effectiveReplyEventId);

  if (evError) {
    return NextResponse.json({ error: evError.message }, { status: 500 });
  }

  // 3. Update campaign_leads.last_reply_reason
  const { error: clUpdateError } = await supabase
    .from("campaign_leads")
    .update({ last_reply_reason: reason })
    .eq("id", campaign_lead_id);

  if (clUpdateError) {
    return NextResponse.json({ error: clUpdateError.message }, { status: 500 });
  }

  // 4. Log activity
  const { error: activityError } = await supabase
    .from("lead_activity")
    .insert({
      lead_id: cl.lead_id,
      campaign_lead_id: campaign_lead_id,
      activity_type: "reply_reason_set",
      activity_data: { reason },
    });

  if (activityError) {
    // Don't fail the request if activity logging fails, but log it
    console.error("Failed to log activity:", activityError);
  }

  return NextResponse.json({ success: true });
}

