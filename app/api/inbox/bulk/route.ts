import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type BulkAction = "mark_reviewed" | "resume" | "mark_replied" | "unpause_resume";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { action, thread_ids } = await req.json().catch(() => ({ action: "", thread_ids: [] }));

  if (!Array.isArray(thread_ids) || thread_ids.length === 0) {
    return NextResponse.json({ error: "no thread_ids" }, { status: 400 });
  }

  switch (action as BulkAction) {
    case "mark_reviewed": {
      for (const id of thread_ids) {
        await supabase.rpc("mark_thread_reviewed", { p_thread: id });
      }
      return NextResponse.json({ ok: true });
    }

    case "resume": {
      let total = 0;
      for (const id of thread_ids) {
        const { data } = await supabase.rpc("resume_thread_sequence", { p_thread: id });
        total += data ?? 0;
      }
      return NextResponse.json({ ok: true, resumed_count: total });
    }

    case "mark_replied": {
      for (const id of thread_ids) {
        await supabase.rpc("mark_thread_as_replied", { p_thread: id });
      }
      return NextResponse.json({ ok: true });
    }

    case "unpause_resume": {
      for (const id of thread_ids) {
        await supabase.rpc("unpause_thread", { p_thread: id, p_resume: true });
      }
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
}

