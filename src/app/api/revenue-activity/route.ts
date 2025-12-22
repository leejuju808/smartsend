import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEffectiveSubscription } from "@/lib/subscription";

function isoDaysAgoStart(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoWeekStart(d = new Date()) {
  // Monday 00:00 local (good enough for UX; not used for billing).
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

/**
 * GET /api/revenue-activity?workspace_id=...
 * Numbers-only metrics for the Revenue Activity screen (BLOCK 267400).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Verify requester is a member of this workspace (do not trust client input).
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const last7dStartIso = isoDaysAgoStart(7);
    const last30dStartIso = isoDaysAgoStart(30);
    const weekStartIso = isoWeekStart(now);

    // Campaigns in workspace (outreach sends + replies are campaign-scoped).
    const { data: campaigns, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (campErr) {
      return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
    }

    const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);

    // Emails sent (last 7 days / all-time). Canonical source: send_logs.
    let emailsSentLast7d = 0;
    let emailsSentAllTime = 0;

    // Replies received (all-time). Canonical source: smartsend_reply_events.
    let repliesReceived = 0;
    let repliesLast30d = 0;
    let repliesThisWeek = 0;

    if (campaignIds.length > 0) {
      const [
        { count: sent7d },
        { count: sentTotal },
        { count: repliesTotal },
        { count: replies30d },
        { count: repliesWeek },
      ] = await Promise.all([
        supabaseAdmin
          .from("send_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .in("status", ["sent", "delivered"])
          .gte("sent_at", last7dStartIso)
          .lte("sent_at", nowIso),
        supabaseAdmin
          .from("send_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .in("status", ["sent", "delivered"]),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .gte("created_at", last30dStartIso)
          .lte("created_at", nowIso),
        supabaseAdmin
          .from("smartsend_reply_events")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .gte("created_at", weekStartIso)
          .lte("created_at", nowIso),
      ]);

      emailsSentLast7d = sent7d || 0;
      emailsSentAllTime = sentTotal || 0;
      repliesReceived = repliesTotal || 0;
      repliesLast30d = replies30d || 0;
      repliesThisWeek = repliesWeek || 0;
    }

    // Lead labels (hot / warm / dead) from leads.outreach_status.
    const [
      { count: hot },
      { count: warm },
      { count: dead },
      { count: hotActive30d },
      { count: warmActive30d },
      { count: hotThisWeek },
      { count: warmThisWeek },
    ] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "hot"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "warm"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "dead"),
      // last 30 days "active" = updated in window (simple/factual)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "hot")
        .gte("updated_at", last30dStartIso),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("outreach_status", "warm")
        .gte("updated_at", last30dStartIso),
      // weekly deltas (new hot/warm signals)
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .not("first_hot_at", "is", null)
        .gte("first_hot_at", weekStartIso)
        .lte("first_hot_at", nowIso),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .not("first_warm_at", "is", null)
        .gte("first_warm_at", weekStartIso)
        .lte("first_warm_at", nowIso),
    ]);

    const hotLeads = hot || 0;
    const warmLeads = warm || 0;
    const deadLeads = dead || 0;

    // Simple definition: active jobs in conversation = hot + warm.
    const jobsInConversation = hotLeads + warmLeads;

    // Estimated Job Value (simple locked logic).
    const estimatedJobValue = hotLeads * 10_000 + warmLeads * 5_000;

    // Jobs booked (appointments) all-time + last 30 days (facts)
    let jobsBookedAllTime = 0;
    let jobsBookedLast30d = 0;
    try {
      const [{ count: apptTotal }, { count: appt30d }] = await Promise.all([
        supabaseAdmin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .neq("status", "cancelled"),
        supabaseAdmin
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .neq("status", "cancelled")
          .gte("created_at", last30dStartIso)
          .lte("created_at", nowIso),
      ]);
      jobsBookedAllTime = apptTotal || 0;
      jobsBookedLast30d = appt30d || 0;
    } catch {
      jobsBookedAllTime = 0;
      jobsBookedLast30d = 0;
    }

    // Follow-up debt (homeowners waiting on reply)
    let homeownersWaitingOnReply = 0;
    try {
      if (campaignIds.length > 0) {
        const { count } = await supabaseAdmin
          .from("inbox_threads")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds)
          .eq("needs_reply", true);
        homeownersWaitingOnReply = count || 0;
      }
    } catch {
      homeownersWaitingOnReply = 0;
    }

    // Never-reset proof stack (DB guarantees max-so-far)
    let proofStack: any = null;
    try {
      const { data } = await supabase.rpc("ss_moat_recompute", { p_workspace_id: workspaceId });
      proofStack = data;
    } catch {
      proofStack = null;
    }

    // City timeline (ownership memory)
    let cityTimeline: any[] = [];
    try {
      const { data } = await supabase.rpc("ss_city_timeline", { p_workspace_id: workspaceId, p_weeks: 8 });
      cityTimeline = (data as any[]) || [];
    } catch {
      cityTimeline = [];
    }

    const subscription = await getEffectiveSubscription(user.id);

    const hotWeek = hotThisWeek || 0;
    const warmWeek = warmThisWeek || 0;
    const valueDeltaWeek = hotWeek * 10_000 + warmWeek * 5_000;

    return NextResponse.json(
      {
        workspace_id: workspaceId,
        as_of: nowIso,
        emails_sent: { last_7_days: emailsSentLast7d, all_time: emailsSentAllTime },
        replies_received: repliesReceived,
        hot_leads: hotLeads,
        warm_leads: warmLeads,
        dead_leads: deadLeads,
        jobs_in_conversation: jobsInConversation,
        estimated_job_value: estimatedJobValue,
        proof_stack: proofStack,
        followup_debt: { homeowners_waiting_on_reply: homeownersWaitingOnReply },
        quiet_compounding: {
          week_start: weekStartIso,
          hot_delta: hotWeek,
          warm_delta: warmWeek,
          estimated_value_delta: valueDeltaWeek,
          replies_delta: repliesThisWeek,
        },
        last_30_days: {
          start: last30dStartIso,
          hot_active: hotActive30d || 0,
          warm_active: warmActive30d || 0,
          replies: repliesLast30d,
          jobs_booked: jobsBookedLast30d,
        },
        jobs_booked_all_time: jobsBookedAllTime,
        city_timeline: cityTimeline,
        subscription,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error("revenue-activity error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}








