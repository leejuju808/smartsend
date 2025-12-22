import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadErr } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadErr) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("thread_lead_peek", { p_thread_id: params.threadId });

  if (error || !data?.ok) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, peek: data });
}

