// API endpoint for sending SMS from inbox
// POST /api/inbox/sms/send

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";
import { insertUnifiedMessage, getCompanyIdFromWorkspace } from "@/lib/unified-messages";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { thread_id, message, contact_id, workspace_id } = await req.json();

    if (!thread_id || !message || !contact_id || !workspace_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get thread and contact info
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("id, contact_id, campaign_id")
      .eq("id", thread_id)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, phone, sms_opt_out")
      .eq("id", contact_id)
      .single();

    if (!contact || !contact.phone) {
      return NextResponse.json(
        { error: "Contact not found or missing phone number" },
        { status: 404 }
      );
    }

    if (contact.sms_opt_out) {
      return NextResponse.json(
        { error: "Contact has opted out of SMS" },
        { status: 400 }
      );
    }

    // Check opt-out status
    const normalizedPhone = normalizePhoneNumber(contact.phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    const { data: isOptedOut } = await supabase.rpc("is_sms_opted_out", {
      p_workspace_id: workspace_id,
      p_phone_number: normalizedPhone,
    });

    if (isOptedOut) {
      return NextResponse.json(
        { error: "Phone number has opted out of SMS" },
        { status: 400 }
      );
    }

    // Get workspace SMS number and provider config
    const { data: workspaceSettings } = await supabase
      .from("workspace_settings")
      .select("settings")
      .eq("workspace_id", workspace_id)
      .single();

    if (!workspaceSettings) {
      return NextResponse.json(
        { error: "Workspace settings not found" },
        { status: 404 }
      );
    }

    const smsConfig = workspaceSettings.settings?.sms;
    if (!smsConfig?.phone_number) {
      return NextResponse.json(
        { error: "Workspace SMS number not configured" },
        { status: 400 }
      );
    }

    // Get SMS provider config (Twilio credentials)
    // Check workspace_settings first, then fall back to environment variables
    const provider = smsConfig.provider || "twilio";
    const credentials = smsConfig.credentials || {};
    
    const providerConfig = {
      provider: provider as "twilio" | "nexmo" | "telnyx",
      credentials: {
        accountSid: credentials.account_sid || credentials.accountSid || process.env.TWILIO_ACCOUNT_SID,
        authToken: credentials.auth_token || credentials.authToken || process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: smsConfig.phone_number,
      },
    };

    if (!providerConfig.credentials.accountSid || !providerConfig.credentials.authToken) {
      return NextResponse.json(
        { error: "SMS provider credentials not configured" },
        { status: 400 }
      );
    }

    // Send SMS
    const smsResult = await sendSMS(normalizedPhone, message, providerConfig);

    if (!smsResult.success) {
      return NextResponse.json(
        { error: smsResult.error || "Failed to send SMS" },
        { status: 500 }
      );
    }

    // Create outbound SMS message record
    const { data: messageRecord, error: messageError } = await supabase
      .from("inbox_messages")
      .insert({
        thread_id: thread_id,
        campaign_id: thread.campaign_id,
        contact_id: contact_id,
        channel: "sms",
        from_phone: smsConfig.phone_number,
        to_phone: normalizedPhone,
        from_email: null,
        to_email: null,
        subject: null,
        body_raw: message,
        body_clean: message,
        received_at: new Date().toISOString(),
        sms_provider_message_id: smsResult.providerMessageId || smsResult.messageId,
        sms_delivery_status: "queued",
        status: "read", // Outbound messages are marked as read
        // Block 268200: human outbound messages are not automation-tagged
        automation_tag: null,
        automation_meta: {},
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating inbox message record:", messageError);
      // SMS was sent, but record creation failed - still return success
    }

    // Update thread
    await supabase
      .from("inbox_threads")
      .update({
        last_message_at: new Date().toISOString(),
        last_channel: "sms",
        last_contact_method: "sms",
        last_contact_at: new Date().toISOString(),
        // Block 268200: start/reset no-response follow-up chain on outbound send
        autofollowup_anchor_at: new Date().toISOString(),
        autofollowup_step: 0,
        autofollowup_last_sent_at: null,
        next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    // Log to SMS QA logs
    if (messageRecord?.id) {
      await supabase.from("sms_qa_logs").insert({
        message_id: messageRecord.id,
        workspace_id: workspace_id,
        direction: "outbound",
        phone_number: normalizedPhone,
        body: message,
      });
    }

    // Block 150000: Insert into unified messages table
    try {
      const companyId = await getCompanyIdFromWorkspace(workspace_id);
      if (companyId) {
        // Try to find lead_id from contact
        let leadId = null;
        if (contact_id) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id, phone, email")
            .eq("id", contact_id)
            .maybeSingle();

          if (contact) {
            const { data: lead } = await supabase
              .from("leads")
              .select("id")
              .or(`phone.eq.${normalizedPhone},email.eq.${contact.email}`)
              .eq("roofing_company_id", companyId)
              .limit(1)
              .maybeSingle();
            leadId = lead?.id || null;
          }
        }

        await insertUnifiedMessage({
          company_id: companyId,
          lead_id: leadId,
          channel: "sms",
          direction: "outgoing",
          sender: "SmartSend",
          sender_phone: smsConfig.phone_number,
          body: message,
          metadata: {
            sms_provider_message_id: smsResult.providerMessageId || smsResult.messageId,
            contact_id: contact_id,
            workspace_id: workspace_id,
            thread_id: thread_id,
          },
          external_id: smsResult.providerMessageId || smsResult.messageId || null,
        });
      }
    } catch (unifiedError) {
      console.warn("Failed to insert unified message for SMS send:", unifiedError);
      // Don't throw - unified message insertion failure shouldn't break SMS sending
    }

    return NextResponse.json({
      success: true,
      message_id: messageRecord?.id,
      provider_message_id: smsResult.providerMessageId || smsResult.messageId,
    });
  } catch (error: any) {
    console.error("Error sending SMS:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

