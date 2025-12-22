// Block 16800 — SmartSend Trials & Onboarding v2
// Trial Nudge Worker - Sends automated nudges during trial

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const NUDGE_SCHEDULE = {
  day_1_first_campaign: 1, // Day 1
  day_2_storm_list_ready: 2, // Day 2
  day_3_warm_leads: 3, // Day 3
  day_4_scheduler_connect: 4, // Day 4
  day_5_first_booking: 5, // Day 5
  day_6_upgrade_reminder: 6, // Day 6
  day_7_trial_ending: 7, // Day 7
};

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient();
  let sent = 0;

  try {
    // Get all users in trial
    const { data: billingAccounts, error: billingError } = await supabase
      .from("billing_accounts")
      .select("id, user_id, created_at, status")
      .eq("status", "trialing");

    if (billingError) {
      console.error("Error fetching billing accounts:", billingError);
      return NextResponse.json({ error: billingError.message }, { status: 500 });
    }

    if (!billingAccounts || billingAccounts.length === 0) {
      return NextResponse.json({ sent: 0, message: "No trial users found" });
    }

    const now = new Date();

    for (const account of billingAccounts) {
      const accountCreatedAt = new Date(account.created_at);
      const daysSinceSignup = Math.floor(
        (now.getTime() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine which nudge to send
      let nudgeType: string | null = null;
      for (const [type, day] of Object.entries(NUDGE_SCHEDULE)) {
        if (daysSinceSignup >= day) {
          nudgeType = type;
        }
      }

      if (!nudgeType) continue;

      // Check if nudge already sent
      const { data: existingNudge } = await supabase
        .from("trial_nudges")
        .select("id")
        .eq("user_id", account.user_id)
        .eq("nudge_type", nudgeType)
        .maybeSingle();

      if (existingNudge) continue;

      // Get onboarding progress to personalize nudge
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("*")
        .eq("user_id", account.user_id)
        .maybeSingle();

      // Create nudge record
      const { error: nudgeError } = await supabase
        .from("trial_nudges")
        .insert({
          user_id: account.user_id,
          account_id: account.id,
          nudge_type: nudgeType,
          sent_at: new Date().toISOString(),
          sent_via: "in_app", // Can be extended to email later
        });

      if (nudgeError) {
        console.error(`Error creating nudge for user ${account.user_id}:`, nudgeError);
        continue;
      }

      // TODO: Send actual in-app notification or email
      // For now, we just create the record
      // In the future, integrate with notification system or email service

      sent++;
    }

    return NextResponse.json({
      success: true,
      sent,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in trial nudge worker:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































