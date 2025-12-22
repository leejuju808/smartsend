import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId, fromEmail, toEmail, bodyText, bodyHtml } = await req.json();

  // Get thread to fetch org_id
  const { data: thread, error: tErr } = await supabase
    .from("threads_new")
    .select("id, org_id")
    .eq("id", threadId)
    .single();

  if (tErr || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Insert outbound message
  const { error: mErr, data: msg } = await supabase
    .from("messages_new")
    .insert({
      thread_id: threadId,
      org_id: thread.org_id,
      direction: "outbound",
      from_email: fromEmail,
      to_email: Array.isArray(toEmail) ? toEmail : [toEmail],
      body_text: bodyText ?? null,
      body_html: bodyHtml ?? null,
    })
    .select("id, sent_at")
    .single();

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 400 });
  }

  // Update thread: bump last_message_at + mark status
  await supabase
    .from("threads_new")
    .update({ 
      last_message_at: new Date().toISOString(), 
      status: "replied" 
    })
    .eq("id", threadId);

  // TODO: enqueue provider send (Gmail/Outlook) via edge function/queue
  // You'll call Gmail API with thread.external_id (store it) to keep threading.

  return NextResponse.json({ ok: true, messageId: msg.id });
}

