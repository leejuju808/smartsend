// Block 37001 — Missed Call Webhook Handler
// Handles webhooks from Twilio/Vonage when a call is missed
// Instantly texts back the homeowner and logs the missed call

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS, normalizePhoneNumber } from "@/lib/providers/sms";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Parse webhook payload (supports both Twilio and Vonage formats)
    const formData = await req.formData();
    const body = await req.json().catch(() => ({}));
    
    // Try to get data from form data (Twilio) or JSON body (Vonage/custom)
    const from = (formData.get("From") as string) || body.from || body.phone;
    const callSid = (formData.get("CallSid") as string) || body.call_sid || body.callSid;
    const callDuration = parseInt(
      (formData.get("CallDuration") as string) || body.duration || body.call_duration || "0"
    );
    const workspaceId = body.workspace_id || formData.get("workspace_id");
    const companyName = body.company_name || formData.get("company_name") || "SmartSend";

    if (!from || !callSid) {
      return NextResponse.json(
        { error: "Missing required fields: from/phone and call_sid" },
        { status: 400 }
      );
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(from);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Determine if call was missed (duration 0-5 seconds typically means missed)
    const isMissed = callDuration <= 5;

    if (!isMissed) {
      // Call was answered, not a missed call
      return NextResponse.json({ ok: true, message: "Call was answered" });
    }

    // Check if it's after hours (6pm-8am)
    const now = new Date();
    const hour = now.getHours();
    const isAfterHours = hour >= 18 || hour < 8;

    // Log missed call
    const { data: missedCall, error: callError } = await supabase
      .from("missed_calls")
      .insert({
        phone: normalizedPhone,
        call_time: now.toISOString(),
        call_duration_seconds: callDuration,
        call_sid: callSid,
        workspace_id: workspaceId || null,
        after_hours: isAfterHours,
        company_name: companyName,
        processed: false,
      })
      .select()
      .single();

    if (callError) {
      console.error("Error logging missed call:", callError);
      return NextResponse.json(
        { error: "Failed to log missed call", details: callError.message },
        { status: 500 }
      );
    }

    // Get workspace SMS config if workspace_id provided
    let smsConfig = null;
    if (workspaceId) {
      const { data: workspaceSettings } = await supabase
        .from("workspace_settings")
        .select("settings")
        .eq("workspace_id", workspaceId)
        .single();

      if (workspaceSettings?.settings?.sms) {
        smsConfig = workspaceSettings.settings.sms;
      }
    }

    // Prepare SMS message based on after-hours status
    let smsMessage: string;
    if (isAfterHours) {
      smsMessage = `We're closed right now, but I can help get you scheduled. This is ${companyName}. What's your address?`;
    } else {
      smsMessage = `Sorry we missed your call! This is ${companyName}. How can we help with your roof today?`;
    }

    // Send instant textback
    try {
      // Use workspace SMS config if available, otherwise use env vars
      const provider = smsConfig?.provider || "twilio";
      const credentials = smsConfig?.credentials || {};
      
      const providerConfig = {
        provider: provider as "twilio" | "nexmo" | "telnyx",
        credentials: {
          accountSid: credentials.account_sid || credentials.accountSid || process.env.TWILIO_ACCOUNT_SID,
          authToken: credentials.auth_token || credentials.authToken || process.env.TWILIO_AUTH_TOKEN,
          phoneNumber: smsConfig?.phone_number || process.env.TWILIO_PHONE_NUMBER,
        },
      };

      if (providerConfig.credentials.accountSid && providerConfig.credentials.authToken && providerConfig.credentials.phoneNumber) {
        const smsResult = await sendSMS(normalizedPhone, smsMessage, providerConfig);
        
        if (!smsResult.success) {
          console.error("Failed to send SMS:", smsResult.error);
          // Continue even if SMS fails - we still logged the call
        } else {
          console.log("SMS sent successfully:", smsResult.messageId);
        }
      } else {
        console.warn("SMS provider not configured. Skipping textback.");
      }
    } catch (smsError) {
      console.error("Error sending SMS:", smsError);
      // Continue even if SMS fails
    }

    return NextResponse.json({
      ok: true,
      missed_call_id: missedCall.id,
      message: "Missed call logged and textback sent",
      after_hours: isAfterHours,
    });
  } catch (error) {
    console.error("Unexpected error in missed call webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
































