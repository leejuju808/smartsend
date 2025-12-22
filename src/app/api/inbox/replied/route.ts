import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Body example:
 * {
 *   "thread_id": "uuid",
 *   "message": {
 *     "from_email": "lead@acme.com",
 *     "from_name": "Ana",
 *     "provider_id": "1752...abc",
 *     "received_at": "2025-11-04T21:05:12Z",
 *     "snippet": "Sounds good, let's book..."
 *   }
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  // Optional: allow anonymous from provider → use service role on server if needed
  const { data: { user } } = await supabase.auth.getUser();

  const { thread_id, message } = await req.json();
  if (!thread_id || !message?.provider_id) {
    return NextResponse.json({ error: "thread_id and message.provider_id required" }, { status: 400 });
  }

  // Get thread to extract campaign_id and lead_id
  const { data: thread, error: threadErr } = await supabase
    .from("inbox_threads")
    .select("campaign_id, lead_id")
    .eq("id", thread_id)
    .single();
  
  if (threadErr || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Insert inbound message (adjust table/columns to your schema)
  const { error: merr } = await supabase.from("inbox_messages").insert({
    thread_id,
    campaign_id: thread.campaign_id,
    lead_id: thread.lead_id,
    direction: "in",
    sender_email: message.from_email ?? null,
    subject: message.subject ?? null,
    body: message.snippet ?? message.body ?? null,
    sent_at: message.received_at ?? new Date().toISOString(),
    raw: message.provider_id ? { provider_id: message.provider_id, from_name: message.from_name } : null
  });
  if (merr) return NextResponse.json({ error: merr.message }, { status: 400 });

  // After inserting inbound message, classify and apply rules
  // Find the message we just inserted by provider_id or by thread_id + direction
  let messageId: string | undefined;
  if (message.provider_id) {
    const { data: byProvider } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("thread_id", thread_id)
      .contains("raw", { provider_id: message.provider_id })
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    messageId = byProvider?.id;
  }
  
  // Fallback: get latest inbound message for this thread
  if (!messageId) {
    const { data: inserted } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("thread_id", thread_id)
      .eq("direction", "in")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    messageId = inserted?.id;
  }

  if (messageId) {
    // Call our classifier endpoint (best-effort, don't block response)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
    fetch(`${baseUrl}/api/inbox/classify/${messageId}`, {
      method: "POST",
      headers: { 
        "content-type": "application/json",
        cookie: (await cookies()).toString() ?? ""
      }
    }).catch((err) => {
      console.error("Classification failed:", err);
      // Non-blocking - continue even if classification fails
    });
  }

  // Mark thread replied & cancel future sends
  const { data: canceled, error: rerr } = await supabase.rpc("mark_reply_and_stop", {
    p_thread: thread_id, p_at: message.received_at ?? new Date().toISOString()
  });
  if (rerr) return NextResponse.json({ error: rerr.message }, { status: 400 });

  return NextResponse.json({ ok: true, canceled: canceled ?? 0 });
}

