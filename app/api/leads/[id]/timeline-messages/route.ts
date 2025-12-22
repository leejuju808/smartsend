import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Block 8450 — Lead Timeline View API
 * Fetches all messages (outbound + inbound) for a specific lead, ordered by timestamp
 * Includes: outbound emails, inbound replies, auto-classified intents, follow-up triggers
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Fetch all email messages for this lead (both inbound and outbound)
  // Note: Some fields may not exist in all schema versions, so we select what's available
  const { data: messages, error: messagesError } = await supabase
    .from("email_messages")
    .select(`
      id,
      direction,
      subject,
      body_text,
      body_html,
      from_email,
      to_email,
      intent_label,
      intent_confidence,
      human_reply,
      classification_label,
      received_at,
      created_at,
      thread_id,
      message_id,
      campaign_id
    `)
    .eq("lead_id", leadId)
    .order("received_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error("Error fetching messages:", messagesError);
    return NextResponse.json(
      { error: messagesError.message },
      { status: 500 }
    );
  }

  // Also fetch message_logs (outbound sends) if they exist separately
  const { data: sendLogs, error: logsError } = await supabase
    .from("message_logs")
    .select(`
      id,
      lead_id,
      campaign_id,
      subject,
      body_text,
      status,
      created_at,
      step_no,
      variant_id
    `)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (logsError) {
    console.error("Error fetching send logs:", logsError);
  }

  // Transform and merge messages
  const timelineItems: any[] = [];

  // Add email_messages
  (messages || []).forEach((msg) => {
    const timestamp = msg.received_at || msg.created_at;
    timelineItems.push({
      id: `msg-${msg.id}`,
      type: msg.direction === "inbound" ? "reply" : "email_sent",
      direction: msg.direction,
      timestamp,
      subject: msg.subject,
      body_text: msg.body_text,
      body_html: msg.body_html,
      from_email: msg.from_email,
      to_email: msg.to_email,
      intent_label: msg.intent_label,
      intent_confidence: msg.intent_confidence,
      human_reply: msg.human_reply,
      classification_label: msg.classification_label,
      thread_id: msg.thread_id,
      message_id: msg.message_id,
      campaign_id: msg.campaign_id,
      source: "email_messages",
    });
  });

  // Add message_logs (outbound sends) if they don't already exist in email_messages
  (sendLogs || []).forEach((log) => {
    // Check if this log is already represented in email_messages
    const exists = timelineItems.some(
      (item) =>
        item.type === "email_sent" &&
        Math.abs(
          new Date(item.timestamp).getTime() -
            new Date(log.created_at).getTime()
        ) < 5000 // Within 5 seconds
    );

    if (!exists) {
      timelineItems.push({
        id: `log-${log.id}`,
        type: "email_sent",
        direction: "outbound",
        timestamp: log.created_at,
        subject: log.subject,
        body_text: log.body_text,
        campaign_id: log.campaign_id,
        step_no: log.step_no,
        variant_id: log.variant_id,
        status: log.status,
        source: "message_logs",
      });
    }
  });

  // Sort all items by timestamp (chronological order)
  timelineItems.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  return NextResponse.json({ items: timelineItems });
}

