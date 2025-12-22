"use server";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  // Ensure access via RLS by selecting from inbox_threads first
  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  const { data: flags, error: flagsError } = await supabase
    .from("v_thread_flags")
    .select("thread_id,is_nudged,is_snoozed,last_outbound_at")
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (flagsError) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    flags:
      flags ?? {
        thread_id: params.threadId,
        is_nudged: false,
        is_snoozed: false,
        last_outbound_at: null,
      },
  });
}


