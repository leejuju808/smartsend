// Block 19900 — Missed Call → Inbox
// POST /api/lead-capture/missed-call
// Converts missed calls into inbox threads

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspace_id,
      caller_phone,
      caller_name,
      call_duration_seconds = 0,
      metadata = {},
    } = body;

    if (!workspace_id || !caller_phone) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, caller_phone" },
        { status: 400 }
      );
    }

    // Find or create contact by phone
    let contactId: string | null = null;

    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("phone", caller_phone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          workspace_id,
          phone: caller_phone,
          first_name: caller_name || null,
          email: null, // Will be updated if we get email later
          lead_source: "missed_call",
          source_meta: {
            created_from: "missed_call",
            caller_name: caller_name || null,
          },
        })
        .select()
        .single();

      if (contactError || !newContact) {
        console.error("Error creating contact:", contactError);
        return NextResponse.json(
          { error: "Failed to create contact" },
          { status: 500 }
        );
      }

      contactId = newContact.id;
    }

    // Create missed call record
    const { data: missedCall, error: missedCallError } = await supabase
      .from("missed_calls")
      .insert({
        workspace_id,
        contact_id: contactId,
        caller_phone,
        caller_name: caller_name || null,
        call_duration_seconds,
        metadata,
      })
      .select()
      .single();

    if (missedCallError) {
      console.error("Error creating missed call record:", missedCallError);
      return NextResponse.json(
        { error: "Failed to create missed call record" },
        { status: 500 }
      );
    }

    // Create inbox thread
    const subject = `Missed Call: ${caller_phone}`;
    const messageBody = [
      `Missed call from ${caller_name || caller_phone}`,
      "",
      `**Call Details:**`,
      `- Phone: ${caller_phone}`,
      `- Caller Name: ${caller_name || "Unknown"}`,
      `- Call Duration: ${call_duration_seconds} seconds`,
      `- Time: ${new Date().toLocaleString()}`,
    ].join("\n");

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .insert({
        workspace_id,
        contact_id: contactId,
        subject,
        status: "open",
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (threadError || !thread) {
      console.error("Error creating thread:", threadError);
      return NextResponse.json(
        { error: "Failed to create inbox thread" },
        { status: 500 }
      );
    }

    // Create initial message
    await supabase.from("inbox_messages").insert({
      thread_id: thread.id,
      sender: caller_phone,
      body: messageBody,
      sent_at: new Date().toISOString(),
      is_incoming: true,
    });

    // Update missed call with thread_id
    await supabase
      .from("missed_calls")
      .update({ thread_id: thread.id })
      .eq("id", missedCall.id);

    // Auto-send SMS if enabled (check workspace settings)
    const shouldSendSMS = await shouldAutoSendSMS(workspace_id);
    if (shouldSendSMS) {
      const smsMessage =
        "Sorry we missed your call — want me to help you schedule a roof inspection?";
      await sendAutoSMS({
        workspace_id,
        contact_id: contactId,
        phone: caller_phone,
        message: smsMessage,
        thread_id: thread.id,
      });

      // Update missed call record
      await supabase
        .from("missed_calls")
        .update({
          auto_sms_sent: true,
          auto_sms_sent_at: new Date().toISOString(),
          sms_message: smsMessage,
        })
        .eq("id", missedCall.id);
    }

    // Create follow-up task
    await supabase.from("tasks").insert({
      workspace_id,
      contact_id: contactId,
      thread_id: thread.id,
      title: "Follow up on missed call",
      description: `Missed call from ${caller_name || caller_phone}`,
      priority: "high",
      status: "open",
      due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
      auto_generated: true,
      auto_source: "missed_call",
    });

    return NextResponse.json({
      success: true,
      contact_id: contactId,
      thread_id: thread.id,
      missed_call_id: missedCall.id,
      sms_sent: shouldSendSMS,
    });
  } catch (error: any) {
    console.error("Error processing missed call:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Check if workspace has auto-SMS enabled for missed calls
async function shouldAutoSendSMS(workspaceId: string): Promise<boolean> {
  // Check workspace settings (implement based on your settings table)
  // For now, default to true
  return true;
}

// Send auto-SMS for missed call
async function sendAutoSMS(params: {
  workspace_id: string;
  contact_id: string;
  phone: string;
  message: string;
  thread_id: string;
}) {
  try {
    // Call SMS API (implement based on your SMS provider)
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sms/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: params.workspace_id,
          contact_id: params.contact_id,
          phone: params.phone,
          message: params.message,
          thread_id: params.thread_id,
        }),
      }
    );

    if (!response.ok) {
      console.error("Failed to send SMS:", await response.text());
    }
  } catch (error) {
    console.error("Error sending SMS:", error);
  }
}



















































