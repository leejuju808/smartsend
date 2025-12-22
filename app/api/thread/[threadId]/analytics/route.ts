import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const stats = await supabase
    .from("v_thread_stats")
    .select("*")
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (stats.error) {
    return NextResponse.json({ error: stats.error.message }, { status: 500 });
  }

  const timeline = await supabase
    .from("v_thread_timeline")
    .select("*")
    .eq("thread_id", params.threadId)
    .order("occurred_at", { ascending: true })
    .limit(500);

  if (timeline.error) {
    return NextResponse.json({ error: timeline.error.message }, { status: 500 });
  }

  return NextResponse.json({
    stats: stats.data ?? null,
    timeline: timeline.data ?? [],
  });
}




