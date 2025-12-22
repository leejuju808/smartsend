import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfDayIso(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function dayKey(iso: string) {
  // YYYY-MM-DD
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

async function getWorkspaceRole(supabase: ReturnType<typeof createClient>, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.role as string | null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No active workspace" }, { status: 400 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  const { data: session } = sessionId
    ? await admin
        .from("owner_away_sessions")
        .select("id, started_at, ended_at")
        .eq("workspace_id", workspaceId)
        .eq("id", sessionId)
        .maybeSingle()
    : await admin
        .from("owner_away_sessions")
        .select("id, started_at, ended_at")
        .eq("workspace_id", workspaceId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!session) {
    return NextResponse.json({ ok: false, error: "No away session found" }, { status: 404 });
  }

  const startedAt = new Date((session as any).started_at);
  const endedAt = new Date(((session as any).ended_at as string | null) || new Date().toISOString());

  const startIso = startedAt.toISOString();
  const endIso = endedAt.toISOString();

  // Build day buckets
  const days: Array<{ day: string; start: string; end: string }> = [];
  for (let d = new Date(startedAt); d <= endedAt; d = addDays(d, 1)) {
    const dayStart = startOfDayIso(d);
    const next = addDays(new Date(dayStart), 1);
    const dayEnd = next.toISOString();
    days.push({ day: dayStart.slice(0, 10), start: dayStart, end: dayEnd });
  }

  // Outreach: email_logs sent during the window for campaigns in this workspace
  const { data: emailRows } = await admin
    .from("email_logs")
    .select("sent_at, status, campaigns!inner(workspace_id)")
    .eq("campaigns.workspace_id", workspaceId)
    .gte("sent_at", startIso)
    .lte("sent_at", endIso)
    .limit(50000);

  const sentByDay = new Map<string, number>();
  for (const r of (emailRows || []) as any[]) {
    if (!r?.sent_at) continue;
    if (String(r.status || "") !== "sent") continue;
    const k = dayKey(r.sent_at);
    if (!k) continue;
    sentByDay.set(k, (sentByDay.get(k) || 0) + 1);
  }

  const outreach = days.map((d) => ({
    day: d.day,
    sent_count: sentByDay.get(d.day) || 0,
    ran: (sentByDay.get(d.day) || 0) > 0,
  }));

  // Replies: inbound inbox messages
  const { data: replyRows } = await admin
    .from("inbox_messages")
    .select("id, created_at, direction, held_for_owner, ai_intent_label, ai_urgency_score")
    .eq("workspace_id", workspaceId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .in("direction", ["in", "inbound"])
    .limit(50000);

  const repliesTotal = (replyRows || []).length;
  const repliesHeld = (replyRows || []).filter((r: any) => r.held_for_owner === true).length;
  const urgentHot = (replyRows || []).filter((r: any) => {
    const label = String(r.ai_intent_label || "");
    const urgency = Number(r.ai_urgency_score || 0);
    return label === "hot_lead" && urgency >= 0.85;
  }).length;

  // Jobs moving: conversions + handoffs
  const { data: conversionRows } = await admin
    .from("jobs_conversions")
    .select("id, created_at, conversion_type, estimated_value, campaigns!inner(workspace_id)")
    .eq("campaigns.workspace_id", workspaceId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(50000);

  const jobsBooked = (conversionRows || []).filter((c: any) => c.conversion_type === "booked_estimate").length;
  const jobsWon = (conversionRows || []).filter((c: any) => c.conversion_type === "won_job").length;
  const bookedValue = (conversionRows || [])
    .filter((c: any) => c.conversion_type === "booked_estimate")
    .reduce((sum: number, c: any) => sum + Number(c.estimated_value || 0), 0);

  const { data: handoffRows } = await admin
    .from("job_handoffs")
    .select("id, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(50000);

  // AUTOPILOT timeline (best-effort): decisions + events during away window.
  let autopilot: any = null;
  try {
    const { data: ws } = await admin
      .from("workspaces")
      .select("autopilot_enabled, autopilot_enabled_at, autopilot_locked, autopilot_locked_at, autopilot_lock_days")
      .eq("id", workspaceId)
      .maybeSingle();

    const { data: events } = await admin
      .from("autopilot_events")
      .select("occurred_at, event_type, meta")
      .eq("workspace_id", workspaceId)
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: true })
      .limit(2000);

    const { data: decisions } = await admin
      .from("autopilot_decisions")
      .select("decided_at, reason, changes, metrics")
      .eq("workspace_id", workspaceId)
      .gte("decided_at", startIso)
      .lte("decided_at", endIso)
      .order("decided_at", { ascending: true })
      .limit(2000);

    autopilot = {
      snapshot: {
        enabled: Boolean((ws as any)?.autopilot_enabled),
        enabled_at: (ws as any)?.autopilot_enabled_at || null,
        locked: Boolean((ws as any)?.autopilot_locked),
        locked_at: (ws as any)?.autopilot_locked_at || null,
        lock_days: Number((ws as any)?.autopilot_lock_days ?? 14),
      },
      events: events || [],
      decisions: decisions || [],
    };
  } catch {
    autopilot = null;
  }

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    session: {
      id: (session as any).id,
      started_at: (session as any).started_at,
      ended_at: (session as any).ended_at,
    },
    window: { start: startIso, end: endIso, days: days.length },
    autopilot,
    proof: {
      outreach,
      replies: {
        total_inbound: repliesTotal,
        held: repliesHeld,
        urgent_hot_escalated: urgentHot,
      },
      jobs: {
        conversions_booked: jobsBooked,
        conversions_won: jobsWon,
        booked_value: Math.round(bookedValue),
        handoffs_generated: (handoffRows || []).length,
      },
    },
  });
}





