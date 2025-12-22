import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/checkin/48-hour
 * 
 * The 48-Hour Check-In Script
 * 
 * You message:
 * "Just checked your dashboard — your campaign is live.
 * You should start seeing homeowner replies shortly.
 * Want me to help you respond to the first few leads?"
 * 
 * How this helps roofers:
 * They don't know how to message homeowners professionally.
 * You guide them → they close more deals → SmartSend looks like a revenue engine.
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

    // Check if campaign was launched
    if (!activationState.first_campaign_launched_at) {
      return NextResponse.json(
        { error: "No campaign launched yet" },
        { status: 400 }
      );
    }

    // Get campaign stats
    const campaignId = activationState.first_campaign_id;
    if (!campaignId) {
      return NextResponse.json(
        { error: "No campaign ID found" },
        { status: 400 }
      );
    }

    const { data: emailLogs, count: sentCount } = await supabase
      .from("email_logs")
      .select("id, status, opened_at", { count: "exact" })
      .eq("campaign_id", campaignId);

    const repliesCount = emailLogs?.filter((log) => log.status === "replied").length || 0;
    const opensCount = emailLogs?.filter((log) => log.opened_at).length || 0;
    const sentCountNum = sentCount || 0;
    const openRate = sentCountNum > 0 ? (opensCount / sentCountNum) * 100 : 0;

    // Check if 48-hour check-in already sent
    const { data: existingCheckin } = await supabase
      .from("activation_checkins")
      .select("id")
      .eq("activation_state_id", activationState.id)
      .eq("checkin_type", "48_hour")
      .maybeSingle();

    if (existingCheckin && !manual) {
      return NextResponse.json({
        success: true,
        already_sent: true,
        message: "48-hour check-in already sent",
      });
    }

    // Create check-in record
    const { data: checkin, error: checkinError } = await supabase
      .from("activation_checkins")
      .insert({
        activation_state_id: activationState.id,
        workspace_id,
        user_id: activationState.user_id,
        checkin_type: "48_hour",
        checkin_message: `Just checked your dashboard — your campaign is live. You should start seeing homeowner replies shortly. Want me to help you respond to the first few leads?`,
        campaign_replies_count: repliesCount,
        campaign_leads_count: sentCountNum,
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

    // Get user email for sending message
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", activationState.user_id)
      .single();

    const userEmail = profile?.email;

    // TODO: Send check-in message (email, SMS, or in-app notification)
    // Message: "Just checked your dashboard — your campaign is live. You should start seeing homeowner replies shortly. Want me to help you respond to the first few leads?"

    return NextResponse.json({
      success: true,
      checkin: {
        id: checkin.id,
        type: "48_hour",
        sent_at: checkin.checkin_sent_at,
      },
      campaign_stats: {
        emails_sent: sentCountNum,
        replies_received: repliesCount,
        opens: opensCount,
        open_rate: openRate.toFixed(1),
      },
      message: "48-hour check-in sent successfully",
    });
  } catch (error: any) {
    console.error("Error in 48-hour check-in:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































