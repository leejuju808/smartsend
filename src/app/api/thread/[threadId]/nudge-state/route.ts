import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { threadId: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const threadId = params.threadId;

  const { data: t, error: te } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, needs_reply")
    .eq("id", threadId)
    .maybeSingle();
  if (te || !t) return NextResponse.json({ needs: false });

  const { data: r } = await supabase
    .from("followup_rules")
    .select("enabled, hours_wait, max_nudges")
    .eq("campaign_id", t.campaign_id)
    .maybeSingle();

  if (!r?.enabled || !t.needs_reply) return NextResponse.json({ needs: false });

  const { data: v } = await supabase
    .from("v_thread_last_inbound")
    .select("last_inbound_at, last_label, thread_id")
    .eq("thread_id", threadId)
    .maybeSingle();

  if (!v) return NextResponse.json({ needs: false });

  const eligibleAt = v.last_inbound_at
    ? new Date(v.last_inbound_at).getTime() + r.hours_wait * 3_600_000
    : Date.now();
  const inMs = eligibleAt - Date.now();

  const { data: fut } = await supabase
    .from("followup_tasks")
    .select("run_at, nudge_no, status, created_at")
    .eq("thread_id", threadId)
    .in("status", ["queued", "working"])
    .order("run_at", { ascending: true })
    .limit(1);

  if (fut && fut.length > 0) {
    const f = fut[0];
    return NextResponse.json({
      needs: true,
      queued_at: f.created_at,
      run_at: f.run_at,
      nudge_no: f.nudge_no
    });
  }

  return NextResponse.json({
    needs: inMs <= 0,
    queued_at: null,
    run_at: new Date(eligibleAt).toISOString(),
    nudge_no: null,
    in_hours: Math.max(0, Math.ceil(inMs / 3_600_000))
  });
}

