// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Send Review Request
// POST /api/reviews/send-request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSMS } from "@/lib/providers/sms";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get job and lead info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        lead_id,
        leads:lead_id(
          id,
          email,
          first_name,
          last_name,
          phone,
          name
        )
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    const lead = job.leads;
    if (!lead) {
      return NextResponse.json(
        { error: "Lead not found for this job" },
        { status: 404 }
      );
    }

    // Create or get review request
    let reviewRequestId;
    const { data: existingRequest } = await supabase
      .from("review_requests")
      .select("id")
      .eq("job_id", job_id)
      .single();

    if (existingRequest) {
      reviewRequestId = existingRequest.id;
    } else {
      // Call database function to create review request
      const { data: reviewRequest, error: createError } = await supabase
        .rpc("send_review_request_automation", {
          p_job_id: job_id,
        });

      if (createError) {
        console.error("Error creating review request:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create review request" },
          { status: 500 }
        );
      }

      reviewRequestId = reviewRequest;
    }

    // Get review request with URL
    const { data: reviewRequest, error: fetchError } = await supabase
      .from("review_requests")
      .select("*")
      .eq("id", reviewRequestId)
      .single();

    if (fetchError || !reviewRequest) {
      return NextResponse.json(
        { error: "Failed to fetch review request" },
        { status: 500 }
      );
    }

    // Generate review link if not exists
    let reviewLink = reviewRequest.review_url;
    if (!reviewLink) {
      const token = Buffer.from(`${reviewRequestId}-${Date.now()}`).toString(
        "base64"
      );
      reviewLink = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsend.ai'}/review/${reviewRequestId}?token=${token}`;
      
      await supabase
        .from("review_requests")
        .update({ review_url: reviewLink })
        .eq("id", reviewRequestId);
    }

    // Get workspace SMS config
    const { data: workspaceSettings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", job.workspace_id)
      .single();

    const smsConfig = workspaceSettings?.settings?.sms;
    const phoneNumber = lead.phone || lead.phone;

    // Prepare SMS message
    const leadName = lead.first_name || lead.name || "there";
    const smsMessage = `Thank you for trusting us with your home, ${leadName}! Could you rate your experience from 1-5 stars? Reply with a number.`;

    let smsSent = false;
    let emailSent = false;

    // Send SMS if phone number exists
    if (phoneNumber && smsConfig) {
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
          const smsResult = await sendSMS(
            phoneNumber,
            smsMessage,
            providerConfig
          );

          if (smsResult.success) {
            smsSent = true;
            await supabase
              .from("review_requests")
              .update({
                sms_sent_at: new Date().toISOString(),
                status: "sent",
                sent_at: new Date().toISOString(),
              })
              .eq("id", reviewRequestId);
          }
        }
      } catch (smsError: any) {
        console.error("Error sending SMS:", smsError);
        // Continue even if SMS fails
      }
    }

    // Send Email if email exists (optional - can be enhanced with email service)
    if (lead.email && !smsSent) {
      // Email sending can be implemented here
      // For now, we'll just mark it as attempted
      emailSent = false;
    }

    return NextResponse.json(
      {
        success: true,
        review_request_id: reviewRequestId,
        review_link: reviewLink,
        sms_sent: smsSent,
        email_sent: emailSent,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error sending review request:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































