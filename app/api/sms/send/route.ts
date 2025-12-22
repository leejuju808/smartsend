// API endpoint for sending SMS
// POST /api/sms/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber, validateSMSMessage, canSendSMSAtTime } from "@/lib/providers/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, message, contactId, campaignId, stepId, organizationId } = body;

    // Validate required fields
    if (!to || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, message" },
        { status: 400 }
      );
    }

    // Validate message content
    const validation = validateSMSMessage(message);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(to);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Get organization ID (from request or from contact/campaign)
    let orgId = organizationId;
    if (!orgId && contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("org_id")
        .eq("id", contactId)
        .single();
      orgId = contact?.org_id;
    }
    if (!orgId && campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("org_id")
        .eq("id", campaignId)
        .single();
      orgId = campaign?.org_id;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: "Organization ID required" },
        { status: 400 }
      );
    }

    // Get organization SMS configuration
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("sms_number, sms_provider, sms_credentials, sms_sent_this_period, sms_period_start")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: "Organization not found or SMS not configured" },
        { status: 404 }
      );
    }

    if (!org.sms_number || !org.sms_provider || !org.sms_credentials) {
      return NextResponse.json(
        { error: "SMS not configured for this organization" },
        { status: 400 }
      );
    }

    // Check SMS plan limits
    const { data: limitCheck } = await supabase.rpc("can_send_sms", {
      p_org_id: orgId,
      p_count: 1,
    });

    if (!limitCheck || limitCheck.length === 0 || !limitCheck[0].allowed) {
      return NextResponse.json(
        {
          error: "SMS limit exceeded",
          current: limitCheck?.[0]?.current_count || 0,
          limit: limitCheck?.[0]?.limit_count || 0,
          remaining: limitCheck?.[0]?.remaining || 0,
        },
        { status: 403 }
      );
    }

    // Check if phone number is suppressed/opted out
    const { data: isSuppressed } = await supabase.rpc("is_sms_suppressed", {
      p_phone: normalizedPhone,
      p_org_id: orgId,
    });

    if (isSuppressed) {
      return NextResponse.json(
        { error: "Phone number is opted out or suppressed" },
        { status: 403 }
      );
    }

    // Check time-based restrictions (8am-8pm local time)
    // For now, we'll use a default timezone - in production, get from contact or org settings
    const timeCheck = canSendSMSAtTime(normalizedPhone);
    if (!timeCheck.allowed) {
      return NextResponse.json(
        { error: timeCheck.reason },
        { status: 403 }
      );
    }

    // Send SMS via provider
    const smsResult = await sendSMS(normalizedPhone, message, {
      provider: org.sms_provider as "twilio" | "nexmo" | "telnyx",
      credentials: org.sms_credentials as any,
    });

    if (!smsResult.success) {
      return NextResponse.json(
        { error: smsResult.error },
        { status: 500 }
      );
    }

    // Increment SMS usage
    await supabase.rpc("increment_sms_usage", {
      p_org_id: orgId,
      p_count: 1,
    });

    // Create message record
    let threadId = null;
    if (contactId) {
      // Find or create thread for this contact
      const { data: existingThread } = await supabase
        .from("reply_threads")
        .select("id")
        .eq("lead_id", contactId)
        .eq("channel", "sms")
        .maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        // Create new SMS thread
        const { data: newThread } = await supabase
          .from("reply_threads")
          .insert({
            lead_id: contactId,
            campaign_id: campaignId || null,
            channel: "sms",
            last_message_at: new Date().toISOString(),
            last_direction: "outbound",
          })
          .select("id")
          .single();

        threadId = newThread?.id || null;
      }
    }

    // Insert message record
    const { data: messageRecord, error: messageError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        channel: "sms",
        phone: normalizedPhone,
        body_text: message,
        from_email: null,
        to_email: null,
        subject: null,
        external_id: smsResult.providerMessageId,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message record:", messageError);
      // Don't fail the request, SMS was sent successfully
    }

    // Update thread last_message_at if thread exists
    if (threadId) {
      await supabase
        .from("reply_threads")
        .update({ last_message_at: new Date().toISOString(), last_direction: "outbound" })
        .eq("id", threadId);
    }

    // Log activity to v3 contact_activity table (Block 13500)
    if (contactId) {
      const { logSMSSentV3 } = await import("@/lib/contactActivityV3");
      await logSMSSentV3(contactId, {
        messageText: message,
        createdBy: null, // System-generated
      });
    }

    return NextResponse.json({
      success: true,
      messageId: messageRecord?.id || smsResult.messageId,
      providerMessageId: smsResult.providerMessageId,
    });
  } catch (error: any) {
    console.error("Error sending SMS:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


