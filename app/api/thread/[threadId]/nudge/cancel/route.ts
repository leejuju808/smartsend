import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("nudge_cancel_draft", { p_thread_id: params.threadId });

  if (error) {
    const msg = ((error as any)?.details || (error as any)?.message || "").toLowerCase();

    if (msg.includes("forbidden") || (error as any)?.code === "42501") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: false, error: "cancel_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown> | null) });
}


