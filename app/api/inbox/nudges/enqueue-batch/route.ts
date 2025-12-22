import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const threadIds: string[] = Array.isArray(body?.threadIds) ? body.threadIds : [];

  if (!threadIds.length) {
    return NextResponse.json({ ok: false, error: "empty_selection" }, { status: 400 });
  }

  const { data: allowed, error: selectErr } = await supabase
    .from("inbox_threads")
    .select("id")
    .in("id", threadIds);

  if (selectErr) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  const ids = (allowed || []).map((row) => row.id);

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "forbidden_or_not_found" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("nudge_enqueue_ab_many", { p_thread_ids: ids });

  if (error) {
    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data ?? {}) });
}

