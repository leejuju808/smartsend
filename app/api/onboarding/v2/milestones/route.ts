// Block 16800 — SmartSend Trials & Onboarding v2
// GET /api/onboarding/v2/milestones - Returns milestone achievements
// POST /api/onboarding/v2/milestones - Record a milestone

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get milestones
  const { data: milestones, error } = await supabase
    .from("milestones")
    .select("*")
    .eq("user_id", user.id)
    .order("achieved_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get progress to check wins
  const { data: progress } = await supabase
    .from("onboarding_progress")
    .select("win_1_email_connected, win_2_list_imported, win_3_campaign_sent, win_4_email_opened, win_5_first_reply, win_6_first_booking")
    .eq("user_id", user.id)
    .maybeSingle();

  const wins = {
    win_1_email_connected: progress?.win_1_email_connected || false,
    win_2_list_imported: progress?.win_2_list_imported || false,
    win_3_campaign_sent: progress?.win_3_campaign_sent || false,
    win_4_email_opened: progress?.win_4_email_opened || false,
    win_5_first_reply: progress?.win_5_first_reply || false,
    win_6_first_booking: progress?.win_6_first_booking || false,
  };

  return NextResponse.json({ milestones: milestones || [], wins });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { milestone_type, metadata } = body as {
    milestone_type: "win_1_email_connected" | "win_2_list_imported" | "win_3_campaign_sent" | "win_4_email_opened" | "win_5_first_reply" | "win_6_first_booking";
    metadata?: Record<string, any>;
  };

  if (!milestone_type) {
    return NextResponse.json({ error: "milestone_type is required" }, { status: 400 });
  }

  // Get account_id
  const { data: progress } = await supabase
    .from("onboarding_progress")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Record milestone
  const { data: milestone, error } = await supabase
    .from("milestones")
    .upsert({
      user_id: user.id,
      account_id: progress?.account_id,
      milestone_type,
      metadata: metadata || {},
    }, {
      onConflict: "user_id,milestone_type",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update progress win flag
  const winFieldMap: Record<string, string> = {
    win_1_email_connected: "win_1_email_connected",
    win_2_list_imported: "win_2_list_imported",
    win_3_campaign_sent: "win_3_campaign_sent",
    win_4_email_opened: "win_4_email_opened",
    win_5_first_reply: "win_5_first_reply",
    win_6_first_booking: "win_6_first_booking",
  };

  if (winFieldMap[milestone_type]) {
    await supabase
      .from("onboarding_progress")
      .update({ [winFieldMap[milestone_type]]: true })
      .eq("user_id", user.id);
  }

  // Record trial event
  const eventTypeMap: Record<string, string> = {
    win_1_email_connected: "email_connected",
    win_2_list_imported: "list_imported",
    win_3_campaign_sent: "campaign_sent",
    win_4_email_opened: "email_opened",
    win_5_first_reply: "email_replied",
    win_6_first_booking: "inspection_booked",
  };

  await supabase.from("trial_events").insert({
    user_id: user.id,
    account_id: progress?.account_id,
    event_type: eventTypeMap[milestone_type] || "first_48h_win",
    event_data: { milestone: milestone_type, metadata },
  });

  return NextResponse.json({ milestone });
}





















































