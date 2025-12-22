import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("nudge_history_for_thread", {
    p_thread_id: params.threadId,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: (data as any[]) ?? [] });
}

