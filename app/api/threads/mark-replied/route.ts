import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { thread_id: threadId, reason } = await req.json();
  const supabase = await createServerClient();
  const { data: me } = await supabase.auth.getUser();

  const { error: markError } = await supabase.rpc("set_thread_replied", {
    p_thread_id: threadId,
    p_via: "manual",
    p_reason: reason ?? "manual_mark",
  });
  if (markError) {
    return NextResponse.json({ error: markError.message }, { status: 400 });
  }

  const { error: auditError } = await supabase.from("reply_audits").insert({
    actor: me.user?.id ?? null,
    thread_id: threadId,
    action: "manual_mark" as const,
    reason: reason ?? null,
    meta: null,
  });
  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


