import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/automation/lead-monitor
 * 
 * Trigger 2 — Lead Monitor
 * Checks reply count
 * Flags "no replies" within 48 hours
 * Suggests new campaign
 * 
 * This runs automatically via cron job or webhook after campaign launch.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // This endpoint can be called by cron or manually
    const body = await req.json().catch(() => ({}));
    const { workspace_id } = body;

    // If workspace_id provided, check that specific workspace
    // Otherwise, check all recently activated workspaces
    let workspacesToCheck: any[] = [];

    if (workspace_id) {
      const { data: activationState } = await supabase
        .from("roofer_activation_state")
        .select("workspace_id, first_campaign_launched_at, first_campaign_id")
        .eq("workspace_id", workspace_id)
        .single();

      if (activationState) {
        workspacesToCheck = [activationState];
      }
    } else {
      // Get all workspaces with campaigns launched in the last 48 hours
      const { data: activationStates } = await supabase
        .from("roofer_activation_state")
        .select("workspace_id, first_campaign_launched_at, first_campaign_id")
        .not("first_campaign_launched_at", "is", null)
        .gte("first_campaign_launched_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

      workspacesToCheck = activationStates || [];
    }

    const results = [];

    for (const activationState of workspacesToCheck) {
      if (!activationState.first_campaign_id) continue;

      const campaignId = activationState.first_campaign_id;
      const launchedAt = new Date(activationState.first_campaign_launched_at);
      const hoursSinceLaunch = (Date.now() - launchedAt.getTime()) / (1000 * 60 * 60);

      // Get reply count for this campaign
      const { data: replies, count: replyCount } = await supabase
        .from("email_logs")
        .select("id", { count: "exact" })
        .eq("campaign_id", campaignId)
        .eq("status", "replied");

      // Get open count
      const { data: opens, count: openCount } = await supabase
        .from("email_logs")
        .select("id", { count: "exact" })
        .eq("campaign_id", campaignId)
        .not("opened_at", "is", null);

      // Get sent count
      const { data: sent, count: sentCount } = await supabase
        .from("email_logs")
        .select("id", { count: "exact" })
        .eq("campaign_id", campaignId)
        .eq("status", "sent");

      const replyCountNum = replyCount || 0;
      const openCountNum = openCount || 0;
      const sentCountNum = sentCount || 0;
      const openRate = sentCountNum > 0 ? (openCountNum / sentCountNum) * 100 : 0;

      // Flag if no replies within 48 hours
      const needsAttention = hoursSinceLaunch >= 48 && replyCountNum === 0;

      if (needsAttention) {
        // Create check-in record
        await supabase.from("activation_checkins").insert({
          activation_state_id: activationState.id,
          workspace_id: activationState.workspace_id,
          user_id: activationState.user_id,
          checkin_type: "48_hour",
          checkin_message: `Your campaign has been live for 48 hours. You've sent ${sentCountNum} emails with ${openCountNum} opens (${openRate.toFixed(1)}% open rate) but no replies yet. Want me to help you launch a new campaign?`,
          campaign_replies_count: replyCountNum,
          campaign_leads_count: sentCountNum,
          campaign_open_rate: openRate,
        });

        // TODO: Send notification email to roofer
        // "Just checked your dashboard — your campaign is live. You should start seeing homeowner replies shortly. Want me to help you respond to the first few leads?"
      }

      results.push({
        workspace_id: activationState.workspace_id,
        campaign_id: campaignId,
        hours_since_launch: hoursSinceLaunch,
        sent_count: sentCountNum,
        open_count: openCountNum,
        reply_count: replyCountNum,
        open_rate: openRate,
        needs_attention: needsAttention,
      });
    }

    return NextResponse.json({
      success: true,
      checked: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Error in lead-monitor:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































