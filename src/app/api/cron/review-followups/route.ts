// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// Cron Job: Process Review Follow-ups
// GET /api/cron/review-followups

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers/sms";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (optional but recommended)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient();

    // Get pending follow-ups that are ready to send
    const now = new Date().toISOString();
    const { data: followups, error: fetchError } = await supabase
      .from("review_followups")
      .select(
        `
        *,
        review_requests:review_request_id(
          id,
          lead_id,
          workspace_id,
          review_url,
          rating,
          status,
          leads:lead_id(
            id,
            phone,
            email,
            first_name,
            name
          )
        )
      `
      )
      .eq("sent", false)
      .lte("scheduled_send_at", now)
      .limit(50); // Process in batches

    if (fetchError) {
      console.error("Error fetching follow-ups:", fetchError);
      return NextResponse.json(
        { error: fetchError.message || "Failed to fetch follow-ups" },
        { status: 500 }
      );
    }

    if (!followups || followups.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No follow-ups to process",
        processed: 0,
      });
    }

    let processed = 0;
    let errors = 0;

    for (const followup of followups) {
      const reviewRequest = followup.review_requests;
      if (!reviewRequest || !reviewRequest.leads) {
        continue;
      }

      const lead = reviewRequest.leads;
      const message = followup.message_text;

      try {
        // Get workspace SMS config
        const { data: workspaceSettings } = await supabase
          .from("workspace_settings")
          .select("settings")
          .eq("workspace_id", reviewRequest.workspace_id)
          .single();

        const smsConfig = workspaceSettings?.settings?.sms;

        if (followup.message_type === "sms" && lead.phone && smsConfig) {
          const provider = smsConfig.provider || "twilio";
          const credentials = smsConfig.credentials || {};

          const providerConfig = {
            provider: provider as "twilio" | "nexmo" | "telnyx",
            credentials: {
              accountSid:
                credentials.account_sid ||
                credentials.accountSid ||
                process.env.TWILIO_ACCOUNT_SID,
              authToken:
                credentials.auth_token ||
                credentials.authToken ||
                process.env.TWILIO_AUTH_TOKEN,
              phoneNumber: smsConfig.phone_number,
            },
          };

          if (
            providerConfig.credentials.accountSid &&
            providerConfig.credentials.authToken
          ) {
            const smsResult = await sendSMS(
              lead.phone,
              message,
              providerConfig
            );

            if (smsResult.success) {
              // Mark follow-up as sent
              await supabase
                .from("review_followups")
                .update({
                  sent: true,
                  sent_at: new Date().toISOString(),
                })
                .eq("id", followup.id);

              // Update review request status if needed
              if (reviewRequest.status === "sent") {
                await supabase
                  .from("review_requests")
                  .update({
                    status: "opened",
                    opened_at: new Date().toISOString(),
                  })
                  .eq("id", reviewRequest.id);
              }

              processed++;
            } else {
              console.error(
                `Failed to send SMS for followup ${followup.id}:`,
                smsResult.error
              );
              errors++;
            }
          }
        } else if (followup.message_type === "email" && lead.email) {
          // Email sending can be implemented here
          // For now, we'll mark it as sent
          await supabase
            .from("review_followups")
            .update({
              sent: true,
              sent_at: new Date().toISOString(),
            })
            .eq("id", followup.id);
          processed++;
        }
      } catch (err: any) {
        console.error(`Error processing followup ${followup.id}:`, err);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors,
      total: followups.length,
    });
  } catch (error: any) {
    console.error("Error in review followups cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































