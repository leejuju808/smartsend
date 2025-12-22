// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Handle Star Rating Response (1-5)
// POST /api/reviews/handle-response

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers/sms";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { review_request_id, rating } = body;

    if (!review_request_id || !rating) {
      return NextResponse.json(
        { error: "review_request_id and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Call database function to handle rating response
    const { data: result, error: handleError } = await supabase.rpc(
      "handle_review_rating_response",
      {
        p_review_request_id: review_request_id,
        p_rating: rating,
      }
    );

    if (handleError) {
      console.error("Error handling rating response:", handleError);
      return NextResponse.json(
        { error: handleError.message || "Failed to handle rating response" },
        { status: 500 }
      );
    }

    const action = result.action;
    const reviewRequestId = result.review_request_id;
    const leadId = result.lead_id;
    const jobId = result.job_id;

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("phone, email, first_name, name")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Get workspace SMS config
    const { data: reviewRequest } = await supabase
      .from("review_requests")
      .select("workspace_id, review_url")
      .eq("id", review_request_id)
      .single();

    const { data: workspaceSettings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", reviewRequest?.workspace_id)
      .single();

    const smsConfig = workspaceSettings?.settings?.sms;

    // HIGH RATING PATH (4-5 stars) → Send review platform links
    if (action === "send_review_links" && rating >= 4) {
      // Get Google review URL from workspace settings or use default
      const googleReviewUrl =
        workspaceSettings?.settings?.reviews?.google_url ||
        workspaceSettings?.settings?.google_review_url ||
        "";

      const leadName = lead.first_name || lead.name || "there";
      const message = `Thank you so much, ${leadName}! Could you leave a quick review on Google? It helps our company grow:\n${googleReviewUrl || reviewRequest?.review_url || ""}`;

      if (lead.phone && smsConfig) {
        try {
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
            await sendSMS(lead.phone, message, providerConfig);

            // Update review request status
            await supabase
              .from("review_requests")
              .update({
                status: "clicked",
                clicked_at: new Date().toISOString(),
                review_link_clicked: true,
              })
              .eq("id", review_request_id);

            // Schedule follow-ups
            await supabase.rpc("schedule_review_followups", {
              p_review_request_id: review_request_id,
            });
          }
        } catch (smsError: any) {
          console.error("Error sending review links SMS:", smsError);
        }
      }

      return NextResponse.json({
        success: true,
        status: "positive",
        rating,
        action: "review_links_sent",
        message: "Review platform links sent to customer",
      });
    }

    // LOW RATING PATH (1-3 stars) → Damage control
    if (action === "send_damage_control" && rating < 4) {
      const leadName = lead.first_name || lead.name || "there";
      const message = `Thank you for your feedback, ${leadName}. Our team will reach out shortly to make things right.`;

      if (lead.phone && smsConfig) {
        try {
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
            await sendSMS(lead.phone, message, providerConfig);
          }
        } catch (smsError: any) {
          console.error("Error sending damage control SMS:", smsError);
        }
      }

      return NextResponse.json({
        success: true,
        status: "negative",
        rating,
        action: "damage_control_sent",
        task_id: result.task_id,
        feedback_id: result.feedback_id,
        message: "Damage control message sent, task created for follow-up",
      });
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("Error handling review response:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































