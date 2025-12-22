// API endpoint for SMS delivery status webhook (Twilio)
// POST /api/inbox/sms/delivery-status
// Updates SMS delivery status from Twilio webhooks

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio webhook form data
    const formData = await req.formData();
    const messageSid = formData.get("MessageSid") as string;
    const messageStatus = formData.get("MessageStatus") as string;
    const errorCode = formData.get("ErrorCode") as string;
    const errorMessage = formData.get("ErrorMessage") as string;

    if (!messageSid || !messageStatus) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      queued: "queued",
      sent: "sent",
      delivered: "delivered",
      failed: "failed",
      undelivered: "failed",
      read: "read",
    };

    const mappedStatus = statusMap[messageStatus.toLowerCase()] || "queued";

    // Find message by provider message ID
    const { data: message } = await supabase
      .from("inbox_messages")
      .select("id, workspace_id, campaign_id")
      .eq("sms_provider_message_id", messageSid)
      .single();

    if (!message) {
      console.error("Message not found for SID:", messageSid);
      // Return success to Twilio anyway
      return NextResponse.json({ success: true });
    }

    // Update message delivery status
    await supabase
      .from("inbox_messages")
      .update({
        sms_delivery_status: mappedStatus,
        sms_delivery_error: errorMessage || null,
      })
      .eq("id", message.id);

    // Create delivery log entry
    await supabase.from("sms_delivery_logs").insert({
      message_id: message.id,
      workspace_id: message.workspace_id,
      provider_message_id: messageSid,
      status: mappedStatus,
      error_code: errorCode || null,
      error_message: errorMessage || null,
      provider_response: {
        MessageSid: messageSid,
        MessageStatus: messageStatus,
        ErrorCode: errorCode,
        ErrorMessage: errorMessage,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error processing SMS delivery status:", error);
    // Return success to Twilio to avoid retries
    return NextResponse.json({ success: true });
  }
}



















































