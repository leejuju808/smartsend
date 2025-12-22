// app/api/inbox/reply/route.ts
// Block 20100 — Send Inbox Reply
// Reply to homeowner from inside SmartSend Inbox

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: {
    conversation_id?: string;
    thread_id?: string; // Support legacy thread_id
    body: string;
    subject?: string;
    from_name?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { conversation_id, thread_id, body: messageBody, subject, from_name } = body;

  // Support both conversation_id and legacy thread_id
  const finalConversationId = conversation_id || thread_id;

  if (!finalConversationId || !messageBody) {
    return NextResponse.json(
      { error: "conversation_id and body required" },
      { status: 400 }
    );
  }

  // Load conversation/thread for context
  const { data: convo, error: convoError } = await supabase
    .from("inbox_threads")
    .select(`
      id,
      campaign_id,
      contact_id,
      contacts:contact_id (
        email,
        first_name,
        last_name
      )
    `)
    .eq("id", finalConversationId)
    .single();

  if (convoError || !convo) {
    console.error("Conversation not found", convoError);
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Get homeowner email from contact
  const contact = convo.contacts as any;
  const homeownerEmail = contact?.email;
  const homeownerName = contact?.first_name || contact?.last_name 
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
    : null;

  if (!homeownerEmail) {
    return NextResponse.json(
      { error: "Homeowner email not found" },
      { status: 400 }
    );
  }

  // Get workspace_id from campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id, subject")
    .eq("id", convo.campaign_id)
    .single();

  const workspaceId = campaign?.workspace_id;

  // Load sending identity from workspace_sending_settings
  let fromEmail = process.env.SMARTSEND_FROM || "noreply@smartsend.ai";
  let fromName = from_name || "SmartSend";

  if (workspaceId) {
    const { data: workspaceSettings } = await supabase
      .from("workspace_sending_settings")
      .select("from_email, from_name")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (workspaceSettings) {
      fromEmail = workspaceSettings.from_email || fromEmail;
      fromName = from_name || workspaceSettings.from_name || fromName;
    }
  }

  const finalSubject = subject || `Re: ${campaign?.subject || "Your roof"}`;

  // TODO: Wire this to your real email sending logic
  // For now, use the existing sendEmail function
  const sendResult = await sendEmail({
    from: `${fromName} <${fromEmail}>`,
    to: homeownerEmail,
    subject: finalSubject,
    text: messageBody,
  });

  if (!sendResult.success) {
    console.error("Failed to send email:", sendResult.error);
    return NextResponse.json(
      { error: sendResult.error || "Failed to send email" },
      { status: 500 }
    );
  }

  // Log message in inbox_messages
  const { error: msgError } = await supabase
    .from("inbox_messages")
    .insert({
      thread_id: finalConversationId,
      direction: "outbound",
      body_raw: messageBody,
      body_clean: messageBody,
      from_email: fromEmail,
      to_email: homeownerEmail,
      subject: finalSubject,
      received_at: new Date().toISOString(),
    });

  if (msgError) {
    console.error("Failed to log outbound message", msgError);
    // Don't fail the request if logging fails
  }

  // Update conversation preview + last contact info
  const { data: updated, error: convoUpdateError } = await supabase
    .from("inbox_threads")
    .update({
      last_message_at: new Date().toISOString(),
      last_contact_method: "email",
      last_contact_at: new Date().toISOString(),
      lead_stage: "working",
      // Block 268200: start/reset no-response follow-up chain on outbound send
      autofollowup_anchor_at: new Date().toISOString(),
      autofollowup_step: 0,
      autofollowup_last_sent_at: null,
      next_action_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", finalConversationId)
    .select()
    .single();

  if (convoUpdateError) {
    console.error("Conversation update error", convoUpdateError);
    return NextResponse.json(
      { error: "Reply sent but failed to update conversation" },
      { status: 500 }
    );
  }

  // NEW — update engagement (outbound replies don't increment reply_count,
  // but they do update last_contact_at which affects scoring)
  await supabase.rpc("fn_update_conversation_engagement", {
    p_conversation_id: finalConversationId,
  });

  return NextResponse.json({ conversation: updated });
}
