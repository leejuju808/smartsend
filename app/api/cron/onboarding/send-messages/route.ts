// Block 23650 — SmartSend Onboarding Email + SMS Pack v1
// Cron job to send scheduled onboarding messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS } from "@/src/lib/providers/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Get pending onboarding messages ready to send
    const { data: pendingMessages, error: fetchError } = await supabase.rpc(
      "get_pending_onboarding_messages"
    );

    if (fetchError) {
      console.error("Error fetching pending messages:", fetchError);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: "No pending onboarding messages",
      });
    }

    // Process each message
    for (const msg of pendingMessages) {
      try {
        // Get template
        const { data: template, error: templateError } = await supabase
          .from("email_templates")
          .select("base_subject, base_body")
          .eq("template_key", msg.message_key)
          .eq("org_id", "00000000-0000-0000-0000-000000000000")
          .maybeSingle();

        if (templateError || !template) {
          throw new Error(`Template not found: ${msg.message_key}`);
        }

        if (msg.message_type === "email") {
          // Send email via Resend
          await sendOnboardingEmail(
            msg.user_email!,
            template.base_subject,
            template.base_body,
            msg.user_id
          );

          // Mark as sent
          await supabase
            .from("onboarding_messages")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", msg.id);

          sent++;
        } else if (msg.message_type === "sms") {
          // Send SMS
          if (!msg.user_phone) {
            throw new Error("User phone number not found");
          }

          const smsResult = await sendOnboardingSMS(
            msg.user_phone,
            template.base_body,
            msg.user_id
          );

          if (smsResult.success) {
            // Mark as sent
            await supabase
              .from("onboarding_messages")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
              })
              .eq("id", msg.id);

            sent++;
          } else {
            throw new Error(smsResult.error || "SMS send failed");
          }
        }
      } catch (error: any) {
        failed++;
        const errorMsg = `Failed to send ${msg.message_key} to user ${msg.user_id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg, error);

        // Mark as failed
        await supabase
          .from("onboarding_messages")
          .update({
            status: "failed",
            error_message: error.message,
          })
          .eq("id", msg.id);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in onboarding message sender:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Send onboarding email via Resend
async function sendOnboardingEmail(
  to: string,
  subject: string,
  body: string,
  userId: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  // Convert plain text body to HTML
  const htmlBody = body.replace(/\n/g, "<br>");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "SmartSend <noreply@smartsend.ai>",
      to: [to],
      subject,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #ffffff; padding: 30px; border-radius: 8px;">
              ${htmlBody}
            </div>
            <p style="margin-top: 30px; font-size: 12px; color: #666;">
              SmartSend AI — Automated Roofing Lead Follow-Up
            </p>
          </body>
        </html>
      `,
      text: body,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Resend error: ${errorData.message || res.statusText}`);
  }
}

// Send onboarding SMS
async function sendOnboardingSMS(
  phone: string,
  body: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user's workspace/org to find SMS provider config
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    // For now, use default SMS provider (can be enhanced to use org-specific config)
    const smsResult = await sendSMS(phone, body, {
      provider: "twilio",
      credentials: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      },
    });

    return smsResult;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to send SMS",
    };
  }
}

