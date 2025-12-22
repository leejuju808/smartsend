import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkCampaignLimit } from "@/lib/billing/enforcement";
import { createSupabaseServer } from "@/lib/supabaseServer";

type StatusPayload = {
  action: "launch" | "pause" | "complete";
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;
  const campaignId = params.id;

  const body = (await req.json()) as StatusPayload;
  const action = body.action;

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, status, start_date, timezone, workspace_id")
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId)
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const currentStatus = campaign.status as string;

  let nextStatus: string;
  let eventType: string;
  let message: string;

  if (action === "launch") {
    // from draft or paused → scheduled (for your dispatcher)
    if (!["draft", "paused"].includes(currentStatus)) {
      return NextResponse.json(
        { error: "Only draft or paused campaigns can be launched" },
        { status: 400 }
      );
    }

    // Check plan limit before activating
    const supabaseAdmin = createSupabaseServer();
    let orgId: string | null = null;

    // Get org_id from campaign or workspace
    if (campaign.org_id) {
      orgId = campaign.org_id;
    } else {
      const { data: workspace } = await supabaseAdmin
        .from("workspaces")
        .select("org_id")
        .eq("id", workspaceId)
        .single();
      orgId = workspace?.org_id || null;

      // Fallback: get user's first org
      if (!orgId) {
        const { data: orgMember } = await supabaseAdmin
          .from("org_members")
          .select("org_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        orgId = orgMember?.org_id || null;
      }
    }

    if (orgId) {
      const limitCheck = await checkCampaignLimit(orgId);
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            error: "PLAN_CAMPAIGN_LIMIT_EXCEEDED",
            message: limitCheck.message || "Campaign limit exceeded for your plan",
            currentCount: limitCheck.currentCount,
            maxAllowed: limitCheck.maxAllowed,
            plan: limitCheck.plan,
          },
          { status: 403 }
        );
      }
    }

    nextStatus = "scheduled";
    eventType = "launched";
    message = "Campaign scheduled to start sending.";
  } else if (action === "pause") {
    if (!["scheduled", "running"].includes(currentStatus)) {
      return NextResponse.json(
        { error: "Only scheduled or running campaigns can be paused" },
        { status: 400 }
      );
    }
    nextStatus = "paused";
    eventType = "paused";
    message = "Campaign paused.";
  } else if (action === "complete") {
    if (!["scheduled", "running", "paused"].includes(currentStatus)) {
      return NextResponse.json(
        { error: "Only active campaigns can be marked complete" },
        { status: 400 }
      );
    }
    nextStatus = "completed";
    eventType = "completed";
    message = "Campaign marked as completed.";
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: nextStatus })
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "Failed to update campaign status" }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("campaign_events").insert({
    campaign_id: campaignId,
    workspace_id: workspaceId,
    type: "status_changed",
    from_status: currentStatus,
    to_status: nextStatus,
    message,
  });

  if (eventError) {
    console.error("Failed to insert campaign event:", eventError);
  }

  // Log to team_activity for pause/launch events
  if (eventType === "paused" || eventType === "launched") {
    const { data: campaignData } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", campaignId)
      .single();

    await supabase.rpc("log_team_activity", {
      p_workspace_id: workspaceId,
      p_user_id: user.id,
      p_campaign_id: campaignId,
      p_type: eventType === "paused" ? "campaign_paused" : "campaign_launched",
      p_title: `Campaign '${campaignData?.name || "Campaign"}' ${eventType === "paused" ? "paused" : "launched"}`,
      p_metadata: {
        campaign_id: campaignId,
        from_status: currentStatus,
        to_status: nextStatus,
      },
    }).catch((err) => {
      console.error("Failed to log campaign status activity:", err);
    });
  }

  return NextResponse.json({
    success: true,
    status: nextStatus,
  });
}



