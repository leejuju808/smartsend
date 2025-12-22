import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("nudge_enqueue_ab", { p_thread_id: params.threadId });

  if (error) {
    const msg = ((error as any)?.details || (error as any)?.message || "").toLowerCase();

    if (msg.includes("cooldown")) {
      return NextResponse.json({ ok: false, error: "thread_cooldown" }, { status: 429 });
    }
    if (msg.includes("daily cap")) {
      return NextResponse.json({ ok: false, error: "lead_daily_cap" }, { status: 429 });
    }
    if (msg.includes("forbidden") || (error as any)?.code === "42501") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (msg.includes("thread not found")) {
      return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...data });
}

