// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Mark Review as Completed
// POST /api/reviews/mark-completed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      review_request_id,
      review_platform,
      review_url,
      trigger_referral = true,
    } = body;

    if (!review_request_id) {
      return NextResponse.json(
        { error: "review_request_id is required" },
        { status: 400 }
      );
    }

    // Get review request
    const { data: reviewRequest, error: fetchError } = await supabase
      .from("review_requests")
      .select("*")
      .eq("id", review_request_id)
      .single();

    if (fetchError || !reviewRequest) {
      return NextResponse.json(
        { error: "Review request not found" },
        { status: 404 }
      );
    }

    // Update review request as completed
    const { data: updatedRequest, error: updateError } = await supabase
      .from("review_requests")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        review_platform: review_platform || reviewRequest.review_platform,
        review_url: review_url || reviewRequest.review_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", review_request_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error marking review as completed:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to mark review as completed" },
        { status: 500 }
      );
    }

    // Update job completion tracking
    await supabase
      .from("job_completion_tracking")
      .update({
        review_received_at: new Date().toISOString(),
        review_rating: reviewRequest.rating,
        review_platform: review_platform || reviewRequest.review_platform,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", reviewRequest.job_id);

    // If 5-star review, trigger referral request
    if (
      trigger_referral &&
      reviewRequest.rating === 5 &&
      reviewRequest.status !== "completed"
    ) {
      // Send referral request message
      const { data: lead } = await supabase
        .from("leads")
        .select("phone, email, first_name, name")
        .eq("id", reviewRequest.lead_id)
        .single();

      if (lead) {
        const { data: workspaceSettings } = await supabase
          .from("workspace_settings")
          .select("settings")
          .eq("workspace_id", reviewRequest.workspace_id)
          .single();

        const smsConfig = workspaceSettings?.settings?.sms;

        if (lead.phone && smsConfig) {
          const leadName = lead.first_name || lead.name || "there";
          const referralMessage = `Thank you so much for the 5-star review, ${leadName}! If you know anyone else who needs roofing help, we'll give them priority scheduling. Reply with their name and number.`;

          try {
            const { sendSMS } = await import("@/lib/providers/sms");
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
              await sendSMS(lead.phone, referralMessage, providerConfig);
            }
          } catch (smsError: any) {
            console.error("Error sending referral request:", smsError);
            // Continue even if SMS fails
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      review_request: updatedRequest,
    });
  } catch (error: any) {
    console.error("Error marking review as completed:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































