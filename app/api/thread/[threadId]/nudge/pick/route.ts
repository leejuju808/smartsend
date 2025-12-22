import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: t, error: tErr } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (tErr || !t) return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });

  const { data, error } = await supabase.rpc("nudge_pick", { p_thread_id: params.threadId });

  if (error) {
    const reason =
      (error as any)?.code === "P0001" ? (error as any)?.details || "pick_failed" : "pick_failed";
    if (reason === "no_variant") return NextResponse.json({ ok: false, reason }, { status: 200 });
    return NextResponse.json({ ok: false, reason }, { status: 500 });
  }

  if (!data?.variant) return NextResponse.json({ ok: false, reason: "no_variant" }, { status: 200 });

  return NextResponse.json({ ok: true, ...data });
}

