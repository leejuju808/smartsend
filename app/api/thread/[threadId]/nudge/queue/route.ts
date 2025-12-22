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
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("nudge_enqueue_ab", { p_thread_id: params.threadId });

  if (error) {
    const msg = ((error as any)?.details || (error as any)?.message || "").toLowerCase();

    if (msg.includes("cooldown")) {
      return NextResponse.json({ error: "thread_cooldown" }, { status: 429 });
    }
    if (msg.includes("daily cap")) {
      return NextResponse.json({ error: "lead_daily_cap" }, { status: 429 });
    }
    if (msg.includes("cap_reached")) {
      return NextResponse.json({ error: "cap_reached" }, { status: 429 });
    }
    if (msg.includes("forbidden") || (error as any)?.code === "42501") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (msg.includes("thread not found")) {
      return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
    }

    return NextResponse.json({ error: "enqueue_failed" }, { status: 500 });
  }

  await supabase
    .from("followup_nudges")
    .insert({
      campaign_id: thread.campaign_id,
      thread_id: thread.id,
      kind: "manual_nudge",
      note: data?.variant_id ? "queued_ab" : "queued",
    })
    .catch(() => null);

  return NextResponse.json({ ok: true, ...data });
}

