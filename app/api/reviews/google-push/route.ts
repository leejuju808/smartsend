// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Send Google Review Link
// POST /api/reviews/google-push
// Sends homeowner a direct Google review URL

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers/sms";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { review_request_id, google_review_url } = body;

    if (!review_request_id) {
      return NextResponse.json(
        { error: "review_request_id is required" },
        { status: 400 }
      );
    }

    // Get review request with homeowner and job info
    const { data: reviewRequest, error: fetchError } = await supabase
      .from("review_requests")
      .select(`
        *,
        homeowner:homeowner_id(
          id,
          email,
          name
        ),
        job:job_id(
          id,
          workspace_id,
          lead_id,
          leads:lead_id(
            phone,
            email,
            first_name,
            name
          )
        )
      `)
      .eq("id", review_request_id)
      .single();

    if (fetchError || !reviewRequest) {
      return NextResponse.json(
        { error: "Review request not found" },
        { status: 404 }
      );
    }

    // Get Google review URL from workspace settings or use provided URL
    let googleUrl = google_review_url;
    if (!googleUrl) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("settings")
        .eq("id", reviewRequest.job.workspace_id)
        .single();

      googleUrl =
        workspace?.settings?.google_review_url ||
        workspace?.settings?.reviews?.google_url ||
        "";
    }

    if (!googleUrl) {
      return NextResponse.json(
        { error: "Google review URL not configured for this workspace" },
        { status: 400 }
      );
    }

    // Update review request with Google URL
    const { error: updateError } = await supabase
      .from("review_requests")
      .update({
        google_review_url: googleUrl,
        review_stage: "google_push",
        updated_at: new Date().toISOString(),
      })
      .eq("id", review_request_id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update review request" },
        { status: 500 }
      );
    }

    // Get lead info for messaging
    const lead = reviewRequest.job?.leads;
    const homeowner = reviewRequest.homeowner;
    const phone = lead?.phone;
    const email = lead?.email || homeowner?.email;
    const name = lead?.first_name || lead?.name || homeowner?.name || "there";

    // Prepare message
    const message = `Thank you so much, ${name}! Your feedback means the world to us. Could you please leave a quick review on Google? It helps our small business grow:\n\n${googleUrl}`;

    let smsSent = false;
    let emailSent = false;

    // Send SMS if phone available
    if (phone) {
      try {
        // Get workspace SMS config
        const { data: workspaceSettings } = await supabase
          .from("workspace_settings")
          .select("settings")
          .eq("workspace_id", reviewRequest.job.workspace_id)
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
            const smsResult = await sendSMS(phone, message, providerConfig);

            if (smsResult.success) {
              smsSent = true;
            }
          }
        }
      } catch (smsError: any) {
        console.error("Error sending SMS:", smsError);
        // Continue even if SMS fails
      }
    }

    // TODO: Send email if email available and SMS not sent
    if (email && !smsSent) {
      // Email sending can be implemented here
      emailSent = false;
    }

    return NextResponse.json(
      {
        success: true,
        google_review_url: googleUrl,
        sms_sent: smsSent,
        email_sent: emailSent,
        message: "Google review link sent to homeowner",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error sending Google review push:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































