// Block 256100 — Customer Check-In Automation Cron Job
// GET /api/warranty/customer-checkins
// Sends annual and seasonal check-in messages to customers
// Should be run daily

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const checkinsSent = {
      annual: 0,
      seasonal_spring: 0,
      seasonal_fall: 0,
      seasonal_winter: 0,
      storm_followup: 0,
      other: 0,
    };
    const errors: string[] = [];

    // Get all teams
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id");

    if (teamsError || !teams) {
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    for (const team of teams) {
      // Get due check-ins
      const { data: dueCheckins, error: checkinsError } = await supabase
        .rpc("get_due_checkins", {
          p_team_id: team.id,
        });

      if (checkinsError) {
        errors.push(`Team ${team.id}: ${checkinsError.message}`);
        continue;
      }

      if (!dueCheckins || dueCheckins.length === 0) {
        continue;
      }

      for (const checkin of dueCheckins) {
        // Get email template based on check-in type
        let subject = "";
        let message = "";

        switch (checkin.checkin_type) {
          case "annual":
            subject = "Annual Roof Check-Up - Time for Your Inspection";
            message = `Hi ${checkin.customer_name || "there"},

It's time for your annual roof check-up! Regular inspections help catch issues early and keep your roof in great condition.

Would you like to schedule a quick inspection? We can come by and make sure everything looks good.

Reply to this message or give us a call to schedule.`;

            break;

          case "seasonal_spring":
            subject = "Spring is Here - Time to Check for Winter Damage";
            message = `Hi ${checkin.customer_name || "there"},

Spring is here! This is the perfect time to check for any winter damage to your roof.

We offer free seasonal roof check-ups. Would you like us to take a quick look and make sure everything is in great shape after the winter?

Reply to schedule!`;

            break;

          case "seasonal_fall":
            subject = "Prepare Your Roof for Winter - Free Fall Check-Up";
            message = `Hi ${checkin.customer_name || "there"},

Fall is the perfect time to prepare your roof for winter. A quick inspection can catch issues before the cold weather arrives.

We'd love to take a quick look and make sure your roof is ready for winter. Want us to schedule a free inspection?

Reply to this message to schedule!`;

            break;

          case "seasonal_winter":
            subject = "Winter Roof Check - Make Sure Everything is Secure";
            message = `Hi ${checkin.customer_name || "there"},

Winter weather can be tough on roofs. If you notice any issues or want a quick check-up, we're here to help.

Would you like us to take a look? Reply to schedule a free inspection.`;

            break;

          default:
            subject = "Roof Check-Up Reminder";
            message = `Hi ${checkin.customer_name || "there"},

Just checking in to see if you'd like a roof inspection. We're here to help keep your roof in great condition!

Reply if you'd like to schedule a free check-up.`;

            break;
        }

        // Send email/SMS notification
        try {
          // Create notification record (you can integrate with your email/SMS service here)
          await supabase.from("customer_events").insert({
            customer_id: checkin.customer_id,
            team_id: team.id,
            event_type: "maintenance_due",
            title: subject,
            description: message,
            priority: "medium",
            status: "pending",
            related_job_id: checkin.job_id,
          });

          // Update check-in as sent
          await supabase
            .from("customer_checkins")
            .update({
              message_sent: true,
              message_sent_at: new Date().toISOString(),
              sent_date: new Date().toISOString().split("T")[0],
              message_content: {
                subject,
                body: message,
              },
            })
            .eq("id", checkin.checkin_id);

          // Update customer's last check-in date
          await supabase
            .from("customers")
            .update({
              last_checkin_date: new Date().toISOString().split("T")[0],
            })
            .eq("id", checkin.customer_id);

          const typeKey = checkin.checkin_type as keyof typeof checkinsSent;
          if (typeKey in checkinsSent) {
            checkinsSent[typeKey]++;
          } else {
            checkinsSent.other++;
          }
        } catch (error: any) {
          errors.push(`Check-in ${checkin.checkin_id}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      checkins_sent: checkinsSent,
      total_checkins: Object.values(checkinsSent).reduce((a, b) => a + b, 0),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in customer-checkins:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















