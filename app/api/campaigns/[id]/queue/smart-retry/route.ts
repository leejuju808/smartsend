import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
  const campaignId = params.id;

  const { data: rows } = await supabase
    .from("send_queue")
    .select("id, attempts")
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .eq("fail_kind", "transient")
    .order("created_at", { ascending: true })
    .limit(500); // safety cap

  if (!rows?.length) return NextResponse.json({ ok: true, retried: 0 });

  // dynamic import to compute backoff in the route
  const { computeBackoffSeconds } = await import("@/lib/send/backoff");

  for (const r of rows) {
    const secs = computeBackoffSeconds((r.attempts ?? 0) + 1, "transient");
    await supabase.from("send_queue").update({
      status: "queued",
      next_attempt_at: new Date(Date.now() + secs * 1000).toISOString(),
      last_error: null,
      fail_code: null,
      fail_kind: null,
    })
    .eq("campaign_id", campaignId)
    .eq("id", r.id)
    .eq("status", "failed");
  }

  return NextResponse.json({ ok: true, retried: rows.length });
}

