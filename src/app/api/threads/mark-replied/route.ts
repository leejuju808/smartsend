import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  try {
    const { thread_id, message_id, reason = "manual" } = await req.json();
    if (!thread_id || !message_id) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    const sb = createServerClient();
    const { error } = await sb.rpc("mark_thread_replied", {
      p_thread: thread_id,
      p_message: message_id,
      p_reason: reason,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}





