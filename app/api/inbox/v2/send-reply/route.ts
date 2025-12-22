// Block 13300 — SmartSend Inbox v2 API
// POST /api/inbox/v2/send-reply
// Send a reply from the inbox

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { thread_id, subject, body_html, body_text, to_email } = await req.json();

  if (!thread_id || !body_text || !to_email) {
    return NextResponse.json(
      { error: "thread_id, body_text, and to_email required" },
      { status: 400 }
    );
  }

  // Get thread info
  const { data: thread } = await supabase
    .from("reply_threads")
    .select("lead_id, campaign_id")
    .eq("id", thread_id)
    .single();

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Create outbound message record
  // Try inbox_messages first
  const messageData: any = {
    thread_id,
    direction: "outbound",
    from_email: user.email || "",
    to_email: Array.isArray(to_email) ? to_email : [to_email],
    subject: subject || "Re: Reply",
    body_text,
    body_html: body_html || body_text.replace(/\n/g, "<br/>"),
    sent_at: new Date().toISOString(),
  };

  const { data: message, error: messageError } = await supabase
    .from("inbox_messages")
    .insert(messageData)
    .select()
    .single();

  if (messageError) {
    // Try reply_messages if inbox_messages doesn't exist
    const { data: replyMessage, error: replyError } = await supabase
      .from("reply_messages")
      .insert({
        ...messageData,
        direction: "outbound",
        sender_email: messageData.from_email,
        recipient_email: Array.isArray(to_email) ? to_email[0] : to_email,
        body: body_text,
      })
      .select()
      .single();

    if (replyError) {
      console.error("Send reply error:", replyError);
      return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
    }
  }

  // Update thread
  await supabase
    .from("reply_threads")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", thread_id);

  // TODO: Actually send the email via your email provider
  // This would integrate with your existing email sending system

  return NextResponse.json({
    success: true,
    message_id: message?.id,
  });
}





















































