// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// Cron Job: Process Crew Job Reminders
// Runs every minute to send scheduled reminders to crew and homeowners

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("key");

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Use service role for cron job
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const nowISO = now.toISOString();

    // Find reminders that are due and not yet sent
    const { data: reminders, error: remindersError } = await supabase
      .from("crew_job_reminders")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          scheduled_start_date,
          workspace_id,
          lead:leads(
            email,
            phone,
            first_name,
            last_name
          )
        )
      `)
      .eq("message_sent", false)
      .lte("scheduled_send_at", nowISO)
      .limit(50); // Process in batches

    if (remindersError) {
      console.error("Error fetching reminders:", remindersError);
      return NextResponse.json(
        { error: "Failed to fetch reminders" },
        { status: 500 }
      );
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No reminders to send",
      });
    }

    let processed = 0;
    let errors = 0;

    // Process each reminder
    for (const reminder of reminders) {
      try {
        const job = reminder.job as any;
        const lead = job?.lead as any;

        // Determine recipient email/phone
        let recipientEmail: string | null = null;
        let recipientPhone: string | null = null;

        if (reminder.recipient_type === "homeowner" && lead) {
          recipientEmail = lead.email || reminder.recipient_email;
          recipientPhone = lead.phone || reminder.recipient_phone;
        } else if (reminder.recipient_type === "crew_leader" || reminder.recipient_type === "crew_member") {
          recipientEmail = reminder.recipient_email;
          recipientPhone = reminder.recipient_phone;
        }

        // Send email if email is available
        if (recipientEmail) {
          // TODO: Integrate with your email provider (Resend, SendGrid, etc.)
          // For now, we'll just log it and mark as sent
          console.log(`Would send email to ${recipientEmail}:`, reminder.message_text);

          // Example: Using Resend (uncomment when ready)
          /*
          if (process.env.RESEND_API_KEY) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "SmartSend <alerts@smartsend.ai>",
                to: recipientEmail,
                subject: reminder.reminder_type === "day_before_crew" 
                  ? "Tomorrow's Job Reminder"
                  : reminder.reminder_type === "day_before_homeowner"
                  ? "Your Roofing Crew is Scheduled Tomorrow"
                  : "Job Update",
                text: reminder.message_text,
              }),
            });
          }
          */
        }

        // Send SMS if phone is available (future integration)
        if (recipientPhone && reminder.reminder_type.includes("crew")) {
          // TODO: Integrate with SMS provider (Twilio, etc.)
          console.log(`Would send SMS to ${recipientPhone}:`, reminder.message_text);
        }

        // Create in-app notification for roofers
        if (reminder.reminder_type.includes("homeowner")) {
          // Notify roofers that homeowner was notified
          const { data: members } = await supabase
            .from("workspace_members")
            .select("user_id")
            .eq("workspace_id", job.workspace_id)
            .in("role", ["owner", "admin"]);

          if (members) {
            for (const member of members) {
              await supabase.from("notifications").insert({
                user_id: member.user_id,
                workspace_id: job.workspace_id,
                type: "crew_reminder_sent",
                title: "Homeowner Reminder Sent",
                body: `Reminder sent to homeowner for ${job.title}`,
                metadata: { job_id: job.id, reminder_id: reminder.id },
              });
            }
          }
        }

        // Mark reminder as sent
        await supabase
          .from("crew_job_reminders")
          .update({
            message_sent: true,
            sent_at: nowISO,
          })
          .eq("id", reminder.id);

        processed++;
      } catch (error: any) {
        console.error(`Error processing reminder ${reminder.id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      message: `Processed ${processed} reminders, ${errors} errors`,
    });
  } catch (error: any) {
    console.error("Error in crew job reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































