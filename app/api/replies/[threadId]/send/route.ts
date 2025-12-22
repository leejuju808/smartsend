import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { body, mailbox_id } = await req.json();

    if (!body || !body.trim()) {
      return NextResponse.json(
        { error: "Message body is required" },
        { status: 400 }
      );
    }

    // Get thread with lead and campaign info
    const { data: thread, error: threadError } = await supabase
      .from("reply_threads")
      .select(`
        id,
        lead_id,
        campaign_id,
        workspace_id,
        subject
      `)
      .eq("id", params.threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get lead email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("email")
      .eq("id", thread.lead_id)
      .single();

    if (leadError || !lead?.email) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Determine mailbox to use
    let effectiveMailboxId = mailbox_id;
    
    if (!effectiveMailboxId) {
      // Try to get default mailbox for workspace/user
      const { data: defaultMailbox } = await supabase
        .from("mailboxes")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      
      effectiveMailboxId = defaultMailbox?.id;
    }

    if (!effectiveMailboxId) {
      return NextResponse.json(
        { error: "No mailbox configured" },
        { status: 400 }
      );
    }

    // Get mailbox details
    const { data: mailbox, error: mailboxError } = await supabase
      .from("mailboxes")
      .select("id, from_email, provider, oauth")
      .eq("id", effectiveMailboxId)
      .single();

    if (mailboxError || !mailbox) {
      return NextResponse.json(
        { error: "Mailbox not found" },
        { status: 404 }
      );
    }

    // Insert into send_queue or use existing send function
    // For now, we'll insert into send_queue and let the queue processor handle it
    const subject = thread.subject?.startsWith("Re:") 
      ? thread.subject 
      : `Re: ${thread.subject || ""}`;

    const { error: queueError } = await supabase
      .from("send_queue")
      .insert({
        mailbox_id: effectiveMailboxId,
        thread_id: params.threadId,
        lead_id: thread.lead_id,
        campaign_id: thread.campaign_id,
        subject: subject,
        body: body,
        scheduled_at: new Date().toISOString(),
        status: "queued",
        meta: { 
          to: lead.email,
          from: mailbox.from_email,
          direction: "reply"
        },
      });

    if (queueError) {
      console.error("Queue error:", queueError);
      return NextResponse.json(
        { error: "Failed to queue message" },
        { status: 500 }
      );
    }

    // Log message in reply_messages or message_logs
    const { error: logError } = await supabase
      .from("reply_messages")
      .insert({
        thread_id: params.threadId,
        workspace_id: thread.workspace_id,
        direction: "outbound",
        body: body,
        sent_at: new Date().toISOString(),
      });

    if (logError) {
      // Try fallback to messages table
      await supabase
        .from("messages")
        .insert({
          thread_id: params.threadId,
          body_text: body,
          direction: "outbound",
          sent_at: new Date().toISOString(),
        });
    }

    // Update thread last_message_at and clear draft
    await supabase
      .from("reply_threads")
      .update({ 
        last_message_at: new Date().toISOString(),
        draft_body: null,
        last_direction: "outbound"
      })
      .eq("id", params.threadId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Send Reply] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reply" },
      { status: 500 }
    );
  }
}









