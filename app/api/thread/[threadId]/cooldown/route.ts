import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  const { data: cooldown, error: cooldownError } = await supabase
    .from("v_thread_cooldown")
    .select("hours_wait,last_inbound_at,next_eligible_at")
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (cooldownError || !cooldown) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const blocked = Boolean(cooldown.next_eligible_at && cooldown.next_eligible_at > nowIso);

  return NextResponse.json({ ok: true, cooldown, blocked });
}


