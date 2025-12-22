import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/checkin/7-day
 * 
 * The 7-Day Success Script
 * 
 * You say:
 * "You've had SmartSend running for a week. Your inbox has X replies and Y leads.
 * Ready for me to launch your next campaign?"
 * 
 * How this helps roofers:
 * Roofers rarely optimize anything.
 * You push them into consistent outreach → more roofs → more value → long-term subscription.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, manual = false } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
        { status: 400 }
      );
    }

    // Get activation state
    const { data: activationState, error: activationError } = await supabase
      .from("roofer_activation_state")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (activationError || !activationState) {
      return NextResponse.json(
        { error: "Activation state not found" },
        { status: 404 }
      );
    }

    // Check if campaign was launched at least 7 days ago
    if (!activationState.first_campaign_launched_at) {
      return NextResponse.json(
        { error: "No campaign launched yet" },
        { status: 400 }
      );
    }

    const launchedAt = new Date(activationState.first_campaign_launched_at);
    const daysSinceLaunch = (Date.now() - launchedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLaunch < 7 && !manual) {
      return NextResponse.json(
        { error: `Campaign launched ${daysSinceLaunch.toFixed(1)} days ago. Need at least 7 days.` },
        { status: 400 }
      );
    }

    // Get all campaign stats (not just first campaign)
    const { data: allEmailLogs, count: totalSentCount } = await supabase
      .from("email_logs")
      .select("id, status, opened_at", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .gte("sent_at", launchedAt.toISOString());

    const totalReplies = allEmailLogs?.filter((log) => log.status === "replied").length || 0;
    const totalOpens = allEmailLogs?.filter((log) => log.opened_at).length || 0;
    const totalSent = totalSentCount || 0;
    const openRate = totalSent > 0 ? (totalOpens / totalSent) * 100 : 0;

    // Get active campaigns count
    const { data: activeCampaigns, count: activeCampaignsCount } = await supabase
      .from("campaigns")
      .select("id", { count: "exact" })
      .eq("workspace_id", workspace_id)
      .in("status", ["active", "scheduled"]);

    // Check if 7-day check-in already sent
    const { data: existingCheckin } = await supabase
      .from("activation_checkins")
      .select("id")
      .eq("activation_state_id", activationState.id)
      .eq("checkin_type", "7_day")
      .maybeSingle();

    if (existingCheckin && !manual) {
      return NextResponse.json({
        success: true,
        already_sent: true,
        message: "7-day check-in already sent",
      });
    }

    // Create check-in record
    const checkinMessage = `You've had SmartSend running for a week. Your inbox has ${totalReplies} replies and ${totalSent} leads. Ready for me to launch your next campaign?`;

    const { data: checkin, error: checkinError } = await supabase
      .from("activation_checkins")
      .insert({
        activation_state_id: activationState.id,
        workspace_id,
        user_id: activationState.user_id,
        checkin_type: "7_day",
        checkin_message: checkinMessage,
        campaign_replies_count: totalReplies,
        campaign_leads_count: totalSent,
        campaign_open_rate: openRate,
      })
      .select()
      .single();

    if (checkinError) {
      return NextResponse.json(
        { error: "Failed to create check-in" },
        { status: 500 }
      );
    }

    // TODO: Send check-in message (email, SMS, or in-app notification)
    // Message: "You've had SmartSend running for a week. Your inbox has X replies and Y leads. Ready for me to launch your next campaign?"

    return NextResponse.json({
      success: true,
      checkin: {
        id: checkin.id,
        type: "7_day",
        sent_at: checkin.checkin_sent_at,
        message: checkinMessage,
      },
      stats: {
        days_since_launch: daysSinceLaunch.toFixed(1),
        total_emails_sent: totalSent,
        total_replies_received: totalReplies,
        total_opens: totalOpens,
        open_rate: openRate.toFixed(1),
        active_campaigns: activeCampaignsCount || 0,
      },
      message: "7-day check-in sent successfully",
    });
  } catch (error: any) {
    console.error("Error in 7-day check-in:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































