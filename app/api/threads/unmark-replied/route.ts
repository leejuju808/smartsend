import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { thread_id: threadId, reason } = await req.json();
  const supabase = await createServerClient();
  const { data: me } = await supabase.auth.getUser();

  const { error: updateError } = await supabase
    .from("inbox_threads")
    .update({
      is_replied: false,
      replied_at: null,
      replied_via: null,
    })
    .eq("id", threadId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { error: auditError } = await supabase.from("reply_audits").insert({
    actor: me.user?.id ?? null,
    thread_id: threadId,
    action: "manual_unmark" as const,
    reason: reason ?? null,
    meta: null,
  });
  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


