import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing draft id" }, { status: 400 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE!,
      { cookies: () => new Map() }
    );

    const { data: draft, error } = await supabase
      .from("followup_drafts")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    // Get the original reply's from_email
    const { data: reply, error: replyError } = await supabase
      .from("email_replies")
      .select("from_email")
      .eq("id", draft.reply_id)
      .single();
    
    if (replyError || !reply) {
      return NextResponse.json({ error: "Original reply not found" }, { status: 404 });
    }

    // Insert into send queue
    const { error: queueError } = await supabase.from("send_queue").insert({
      to_email: reply.from_email,
      subject: draft.draft_subject,
      body: draft.draft_body,
      status: "queued",
      scheduled_at: new Date().toISOString(),
    });

    if (queueError) throw queueError;

    // Update draft status to sent
    const { error: updateError } = await supabase
      .from("followup_drafts")
      .update({ status: "sent" })
      .eq("id", id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}