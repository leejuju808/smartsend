// Block 16800 — SmartSend Trials & Onboarding v2
// Milestone Tracker Worker - Tracks milestone achievements automatically

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient();
  let processed = 0;

  try {
    // Get all users in trial who haven't completed onboarding
    const { data: progressRecords, error: progressError } = await supabase
      .from("onboarding_progress")
      .select("user_id, account_id, step_2_email_connected, step_3_list_imported, step_4_campaign_sent")
      .eq("completed", false);

    if (progressError) {
      console.error("Error fetching progress records:", progressError);
      return NextResponse.json({ error: progressError.message }, { status: 500 });
    }

    if (!progressRecords || progressRecords.length === 0) {
      return NextResponse.json({ processed: 0, message: "No records to process" });
    }

    // Check for milestone achievements
    for (const progress of progressRecords) {
      const updates: any = {};
      let milestoneToRecord: string | null = null;

      // Win 4: Email Opened - Check if any emails were opened
      if (progress.step_4_campaign_sent && !progress.win_4_email_opened) {
        const { data: emailLogs } = await supabase
          .from("email_logs")
          .select("id")
          .eq("user_id", progress.user_id)
          .eq("opened", true)
          .limit(1)
          .maybeSingle();

        if (emailLogs) {
          updates.win_4_email_opened = true;
          milestoneToRecord = "win_4_email_opened";
        }
      }

      // Win 5: First Reply - Check if any replies exist
      if (progress.step_4_campaign_sent && !progress.win_5_first_reply) {
        const { data: replies } = await supabase
          .from("email_replies")
          .select("id")
          .eq("user_id", progress.user_id)
          .limit(1)
          .maybeSingle();

        if (replies) {
          updates.win_5_first_reply = true;
          milestoneToRecord = "win_5_first_reply";
        }
      }

      // Win 6: First Booking - Check if any appointments were booked
      if (progress.step_4_campaign_sent && !progress.win_6_first_booking) {
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id")
          .eq("user_id", progress.user_id)
          .eq("status", "confirmed")
          .limit(1)
          .maybeSingle();

        if (appointments) {
          updates.win_6_first_booking = true;
          milestoneToRecord = "win_6_first_booking";
        }
      }

      // Update progress if milestones achieved
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("onboarding_progress")
          .update(updates)
          .eq("user_id", progress.user_id);

        // Record milestone
        if (milestoneToRecord) {
          await supabase.from("milestones").upsert({
            user_id: progress.user_id,
            account_id: progress.account_id,
            milestone_type: milestoneToRecord,
            achieved_at: new Date().toISOString(),
          }, {
            onConflict: "user_id,milestone_type",
          });

          // Record trial event
          const eventTypeMap: Record<string, string> = {
            win_4_email_opened: "email_opened",
            win_5_first_reply: "email_replied",
            win_6_first_booking: "inspection_booked",
          };

          await supabase.from("trial_events").insert({
            user_id: progress.user_id,
            account_id: progress.account_id,
            event_type: eventTypeMap[milestoneToRecord] || "first_48h_win",
            event_data: { milestone: milestoneToRecord },
          });

          processed++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in milestone tracker:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































