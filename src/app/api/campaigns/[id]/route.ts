import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function getWorkspaceId(supabase: ReturnType<typeof createRouteHandlerClient>) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user.id;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const workspace_id = await getWorkspaceId(supabase);
    const campaignId = params.id;

    // Validate campaign belongs to workspace
    const { data: camp, error: cErr } = await supabase
      .from("campaigns").select("id, workspace_id, name, status, created_at, subject_template, body_template, auto_reply_detection, auto_optimize, paused_by_guard, pause_reason, use_lead_local_time, fallback_timezone, skip_weekends, skip_holidays, fallback_country")
      .eq("id", campaignId).single();
    if (cErr || !camp || camp.workspace_id !== workspace_id)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const [{ data: funnel }, { data: events }, { data: failed }] = await Promise.all([
      supabase.from("v_campaign_funnel").select("*")
        .eq("campaign_id", campaignId).single(),
      supabase.from("v_campaign_recent_events").select("*")
        .eq("job_status", "sent")  // still show opens/clicks/delivered/etc. tied to sent jobs
        .limit(150),
      supabase.from("email_jobs").select("id,to_email,subject,attempts,last_error,created_at")
        .eq("campaign_id", campaignId).eq("status", "failed")
        .order("created_at", { ascending: false }).limit(100)
    ]);

    return NextResponse.json({ ok: true, campaign: camp, funnel, recentEvents: events ?? [], failed: failed ?? [] });
  } catch (e: any) {
    const msg = e?.message === "Unauthorized" ? "Unauthorized" : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json();
  const { data: role } = await supabase.rpc('get_user_campaign_role', { p_campaign: params.id });
  if (!['owner', 'editor'].includes(role)) return NextResponse.json({ error: 'not authorized' }, { status: 403 });
  const allowed = (({ 
    tz, 
    send_window_start, 
    send_window_end, 
    stop_on_reply, 
    respect_suppression,
    daily_cap,
    throttle_per_minute,
    warmup_mode
  }) => ({ 
    tz, 
    send_window_start, 
    send_window_end, 
    stop_on_reply,
    respect_suppression,
    daily_cap,
    throttle_per_minute,
    warmup_mode
  }))(body);
  const { error } = await supabase.from('campaigns').update(allowed).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Action: retry failed
  const supabase = createRouteHandlerClient({ cookies });
  try {
    const workspace_id = await getWorkspaceId(supabase);
    const campaignId = params.id;
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body?.limit ?? 100), 1000)); // safety cap

    // Validate campaign ownership
    const { data: camp, error: cErr } = await supabase
      .from("campaigns").select("id, workspace_id").eq("id", campaignId).single();
    if (cErr || !camp || camp.workspace_id !== workspace_id)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Requeue up to N failed jobs
    const { data: ids } = await supabase
      .from("email_jobs")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .order("created_at", { ascending: true })
      .limit(limit);

    const idList = (ids ?? []).map((r: any) => r.id);
    if (idList.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const { error: upErr } = await supabase
      .from("email_jobs")
      .update({
        status: "queued",
        scheduled_for: new Date(Date.now() + 60_000).toISOString(),
        locked_by: null,
        locked_at: null
      })
      .in("id", idList);

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, updated: idList.length });
  } catch (e: any) {
    const msg = e?.message === "Unauthorized" ? "Unauthorized" : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}