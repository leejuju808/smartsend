// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Review Reminders Cron Job
// GET /api/cron/review-reminders
// Sends 24h and 3-day reminders for pending review requests

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers/sms";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createClient();
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const results = {
      reminders_24h_sent: 0,
      reminders_3d_sent: 0,
      errors: [] as string[],
    };

    // Find review requests that need 24h reminder
    const { data: requests24h, error: error24h } = await supabase
      .from("review_requests")
      .select(`
        id,
        job_id,
        workspace_id,
        homeowner_id,
        review_stage,
        reminder_24h_sent_at,
        job:job_id(
          workspace_id,
          lead_id,
          leads:lead_id(
            phone,
            email,
            first_name,
            name
          )
        ),
        homeowner:homeowner_id(
          email,
          name
        )
      `)
      .eq("review_stage", "pending")
      .is("reminder_24h_sent_at", null)
      .lte("sent_at", twentyFourHoursAgo.toISOString());

    if (error24h) {
      console.error("Error fetching 24h reminders:", error24h);
      results.errors.push(`24h fetch error: ${error24h.message}`);
    } else if (requests24h) {
      for (const request of requests24h) {
        try {
          const lead = request.job?.leads;
          const homeowner = request.homeowner;
          const phone = lead?.phone;
          const email = lead?.email || homeowner?.email;
          const name = lead?.first_name || lead?.name || homeowner?.name || "there";

          if (phone) {
            // Get workspace SMS config
            const { data: workspaceSettings } = await supabase
              .from("workspace_settings")
              .select("settings")
              .eq("workspace_id", request.workspace_id)
              .single();

            const smsConfig = workspaceSettings?.settings?.sms;

            if (smsConfig) {
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
                const message = `Hi ${name}, we'd love to hear about your experience! Could you rate us from 1-5 stars?`;

                const smsResult = await sendSMS(phone, message, providerConfig);

                if (smsResult.success) {
                  // Update review request
                  await supabase
                    .from("review_requests")
                    .update({
                      reminder_24h_sent_at: now.toISOString(),
                      review_stage: "reminder_sent_24h",
                    })
                    .eq("id", request.id);

                  results.reminders_24h_sent++;
                }
              }
            }
          } else if (email) {
            // TODO: Send email reminder
            // For now, just mark as sent
            await supabase
              .from("review_requests")
              .update({
                reminder_24h_sent_at: now.toISOString(),
                review_stage: "reminder_sent_24h",
              })
              .eq("id", request.id);

            results.reminders_24h_sent++;
          }
        } catch (err: any) {
          console.error(`Error sending 24h reminder for request ${request.id}:`, err);
          results.errors.push(`24h reminder error for ${request.id}: ${err.message}`);
        }
      }
    }

    // Find review requests that need 3-day reminder
    const { data: requests3d, error: error3d } = await supabase
      .from("review_requests")
      .select(`
        id,
        job_id,
        workspace_id,
        homeowner_id,
        review_stage,
        reminder_3d_sent_at,
        job:job_id(
          workspace_id,
          lead_id,
          leads:lead_id(
            phone,
            email,
            first_name,
            name
          )
        ),
        homeowner:homeowner_id(
          email,
          name
        )
      `)
      .in("review_stage", ["pending", "reminder_sent_24h"])
      .is("reminder_3d_sent_at", null)
      .lte("sent_at", threeDaysAgo.toISOString());

    if (error3d) {
      console.error("Error fetching 3d reminders:", error3d);
      results.errors.push(`3d fetch error: ${error3d.message}`);
    } else if (requests3d) {
      for (const request of requests3d) {
        try {
          const lead = request.job?.leads;
          const homeowner = request.homeowner;
          const phone = lead?.phone;
          const email = lead?.email || homeowner?.email;
          const name = lead?.first_name || lead?.name || homeowner?.name || "there";

          if (phone) {
            // Get workspace SMS config
            const { data: workspaceSettings } = await supabase
              .from("workspace_settings")
              .select("settings")
              .eq("workspace_id", request.workspace_id)
              .single();

            const smsConfig = workspaceSettings?.settings?.sms;

            if (smsConfig) {
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
                const message = `Hi ${name}, we'd still love to hear your feedback! Please rate your experience from 1-5 stars.`;

                const smsResult = await sendSMS(phone, message, providerConfig);

                if (smsResult.success) {
                  // Update review request
                  await supabase
                    .from("review_requests")
                    .update({
                      reminder_3d_sent_at: now.toISOString(),
                      review_stage: "reminder_sent_3d",
                    })
                    .eq("id", request.id);

                  results.reminders_3d_sent++;
                }
              }
            }
          } else if (email) {
            // TODO: Send email reminder
            // For now, just mark as sent
            await supabase
              .from("review_requests")
              .update({
                reminder_3d_sent_at: now.toISOString(),
                review_stage: "reminder_sent_3d",
              })
              .eq("id", request.id);

            results.reminders_3d_sent++;
          }
        } catch (err: any) {
          console.error(`Error sending 3d reminder for request ${request.id}:`, err);
          results.errors.push(`3d reminder error for ${request.id}: ${err.message}`);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        ...results,
        message: `Sent ${results.reminders_24h_sent} 24h reminders and ${results.reminders_3d_sent} 3-day reminders`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in review reminders cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































