import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { draftId } = await req.json();
    if (!draftId) {
      return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Get the draft
    const { data: draft, error: draftError } = await supabase
      .from("ai_followup_queue")
      .select("*")
      .eq("id", draftId)
      .single();

    if (draftError || !draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    // Get thread info
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, org_id, lead_email, subject, lead_id")
      .eq("id", draft.thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get user profile to determine sender email
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get profile to find from_email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const fromEmail = profile?.email || "noreply@smartsend.ai";

    // Insert as outbound message (same as replies/send)
    const { error: msgError, data: message } = await supabase
      .from("messages")
      .insert({
        thread_id: draft.thread_id,
        org_id: draft.org_id,
        direction: "outbound",
        from_email: fromEmail,
        to_email: [thread.lead_email],
        body_text: draft.ai_draft,
        body_html: draft.ai_draft.replace(/\n/g, "<br>"),
      })
      .select("id")
      .single();

    if (msgError) {
      console.error("Error inserting message:", msgError);
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // Update thread
    await supabase
      .from("threads")
      .update({
        last_message_at: new Date().toISOString(),
        status: "replied",
      })
      .eq("id", draft.thread_id);

    // Mark draft as sent
    await supabase
      .from("ai_followup_queue")
      .update({ status: "sent", updated_at: new Date().toISOString() })
      .eq("id", draftId);

    // TODO: Enqueue actual email sending via provider (Gmail/Outlook) via edge function/queue
    // For now, the message is stored in the database and can be sent by a worker process

    return NextResponse.json({ ok: true, messageId: message.id });
  } catch (error) {
    console.error("Error in followups/send:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

