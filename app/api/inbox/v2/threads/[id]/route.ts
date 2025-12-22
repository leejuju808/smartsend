// Block 13300 — SmartSend Inbox v2 API
// GET /api/inbox/v2/threads/[id]
// Returns full thread details with messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const threadId = params.id;

  // Get thread with lead info - try v_inbox_v2_threads first, fallback to direct query
  let thread: any = null;
  let threadError: any = null;

  const { data: viewThread } = await supabase
    .from("v_inbox_v2_threads")
    .select("*")
    .eq("id", threadId)
    .single();

  if (viewThread) {
    thread = viewThread;
  } else {
    // Fallback: try reply_threads directly
    const { data: replyThread, error: rtError } = await supabase
      .from("reply_threads")
      .select("*")
      .eq("id", threadId)
      .single();
    
    if (replyThread) {
      thread = replyThread;
    } else {
      // Try inbox_threads
      const { data: inboxThread, error: itError } = await supabase
        .from("inbox_threads")
        .select("*")
        .eq("id", threadId)
        .single();
      
      if (inboxThread) {
        thread = inboxThread;
      } else {
        threadError = itError || rtError;
      }
    }
  }

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Get messages for this thread - lazy load, select only needed columns
  // Only fetch body_clean (not body_raw) and essential metadata
  let messagesQuery = supabase
    .from("inbox_messages")
    .select(`
      id,
      direction,
      from_email,
      to_email,
      subject,
      body_clean,
      body_html,
      received_at,
      sent_at,
      created_at,
      ai_intent,
      ai_confidence,
      lead_score
    `)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("received_at", { ascending: true });

  const { data: messages, error: messagesError } = await messagesQuery;

  // If no messages in inbox_messages, try reply_messages
  let finalMessages = messages || [];
  if (!messages || messages.length === 0) {
    const { data: replyMessages } = await supabase
      .from("reply_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    
    finalMessages = replyMessages || [];
  }

  // Get lead notes
  const { data: notes } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", thread.lead_id)
    .order("created_at", { ascending: false });

  // Get tasks
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("lead_id", thread.lead_id)
    .order("due_at", { ascending: true });

  // Format messages
  const formattedMessages = (finalMessages || []).map((msg: any) => ({
    id: msg.id,
    direction: msg.direction === "inbound" || msg.direction === "in" ? "in" : "out",
    from_email: msg.from_email || msg.sender_email,
    to_email: msg.to_email || msg.recipient_email,
    subject: msg.subject,
    body_text: msg.body_text || msg.body,
    body_html: msg.body_html || msg.body_html_cleaned,
    body_html_cleaned: msg.body_html_cleaned,
    sent_at: msg.sent_at || msg.created_at,
    delivered_at: msg.delivered_at,
    read_at: msg.read_at,
    has_quoted_text: msg.has_quoted_text || false,
    signature_removed: msg.signature_removed || false,
  }));

  return NextResponse.json({
    thread: {
      id: thread.id,
      lead_id: thread.lead_id,
      campaign_id: thread.campaign_id,
      pinned: thread.pinned,
      latest_intent: thread.latest_intent,
      status: thread.status,
      unread_count: thread.unread_count,
      last_message_at: thread.last_message_at,
      snippet: thread.snippet,
      has_notes: thread.has_notes,
      suppressed: thread.suppressed,
    },
    lead: {
      id: thread.lead_id,
      email: thread.lead_email,
      name: thread.lead_name || 
            (thread.first_name && thread.last_name 
              ? `${thread.first_name} ${thread.last_name}`.trim()
              : thread.lead_email) ||
            "Homeowner",
      first_name: thread.first_name,
      last_name: thread.last_name,
      city: thread.city,
      state: thread.state,
      status: thread.lead_status,
      estimated_value: thread.estimated_value,
    },
    campaign: thread.campaign_name ? {
      id: thread.campaign_id,
      name: thread.campaign_name,
    } : null,
    messages: formattedMessages,
    notes: notes || [],
    tasks: tasks || [],
  });
}

