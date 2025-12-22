import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { getAutopilotSnapshot } from "@/lib/autopilot/guard";

type NextAction = { label: string; reason: string; url: string };

function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartUtc(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}

function addMonthsUtc(d: Date, deltaMonths: number) {
  const year = d.getUTCFullYear();
  const month0 = d.getUTCMonth();
  return new Date(Date.UTC(year, month0 + deltaMonths, 1, 0, 0, 0, 0));
}

function safeNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

export async function GET(_req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No active workspace" }, { status: 400 });
  }

  // Validate membership (cookie-derived workspace must be checked)
  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isMember) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();
  const nowIso = new Date().toISOString();

  // =========================================================
  // 1) System state (no-founder dependency)
  // =========================================================
  const autopilot = await getAutopilotSnapshot(workspaceId).catch(() => ({
    enabled: false,
    enabled_at: null,
    locked: false,
    locked_at: null,
    lock_days: 14,
  }));

  let workspace: any = null;
  try {
    const { data } = await admin
      .from("workspaces")
      .select(
        "id,outreach_state,institutional_policy_locked,institutional_policy_locked_at,autopilot_enabled,autopilot_locked"
      )
      .eq("id", workspaceId)
      .maybeSingle();
    workspace = data || null;
  } catch {
    workspace = null;
  }

  // Campaign continuity (paused = risk)
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id,status,is_paused,paused_by_guard")
    .eq("workspace_id", workspaceId)
    .limit(500);

  const pausedCampaigns =
    (campaigns ?? []).filter((c: any) => {
      const status = String(c?.status ?? "").toLowerCase();
      const statusPaused = status === "paused";
      const isPaused = Boolean(c?.is_paused);
      const guardPaused = Boolean(c?.paused_by_guard);
      return statusPaused || isPaused || guardPaused;
    }) ?? [];

  const { count: activeCampaignsCount } = await admin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", ["active", "running", "sending"]);

  // Last outbound proof
  const { data: lastSend } = await admin
    .from("activity_logs")
    .select("created_at")
    .eq("workspace_id", workspaceId)
    .eq("category", "sending")
    .in("type", ["campaign_email_sent", "followup_sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastOutboundAt = (lastSend as any)?.created_at ?? null;

  // =========================================================
  // 2) Today’s priorities (replaceable operator)
  // =========================================================
  const { data: queueRows, error: queueErr } = await supabase
    .from("daily_operator_queue")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("rank", { ascending: true })
    .limit(250);

  const queueItems = (queueRows ?? []) as any[];
  const hot = queueItems.filter((i) => String(i.item_type) === "hot_reply");
  const stalled = queueItems.filter((i) => String(i.item_type) === "stalled_estimate");
  const due = queueItems.filter((i) => String(i.item_type) === "followup_due");
  const atRisk = [...stalled, ...due].reduce((sum, i) => sum + safeNumber(i.revenue_potential), 0);

  // =========================================================
  // 3) Transfer-ready revenue story (Input → Conversations → Jobs → Revenue)
  // =========================================================
  const start = monthStartUtc(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);
  const windowStart = addMonthsUtc(start, -11); // 12 months including current month
  const windowStartIso = windowStart.toISOString();

  const months: Array<{
    month: string; // YYYY-MM
    emails_sent: number;
    replies_received: number;
    booked_jobs: number;
    completed_revenue: number;
  }> = [];
  for (let i = 0; i < 12; i++) {
    const m = addMonthsUtc(windowStart, i);
    months.push({
      month: `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, "0")}`,
      emails_sent: 0,
      replies_received: 0,
      booked_jobs: 0,
      completed_revenue: 0,
    });
  }
  const idx = new Map(months.map((m, i) => [m.month, i]));

  // 3A) Outreach + replies (from legacy lock rollup; fall back gracefully)
  try {
    const { data: outreachRows } = await admin
      .from("mv_workspace_monthly_outreach")
      .select("month,emails_sent,replies_received")
      .eq("workspace_id", workspaceId)
      .gte("month", windowStartIso)
      .order("month", { ascending: true })
      .limit(200);

    for (const r of (outreachRows ?? []) as any[]) {
      const mk = String(r.month || "").slice(0, 7);
      const i = idx.get(mk);
      if (i === undefined) continue;
      months[i].emails_sent = safeNumber(r.emails_sent);
      months[i].replies_received = safeNumber(r.replies_received);
    }
  } catch {
    // ignore
  }

  // 3B) Jobs booked (estimate approvals)
  try {
    const { data: companies } = await admin
      .from("roofing_companies")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(250);
    const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);
    if (companyIds.length > 0) {
      const { data: approvals } = await admin
        .from("estimates")
        .select("approved_at")
        .in("company_id", companyIds)
        .not("approved_at", "is", null)
        .gte("approved_at", windowStartIso)
        .limit(50_000);

      for (const r of (approvals ?? []) as any[]) {
        const mk = monthKeyFromIso(String(r.approved_at));
        const i = idx.get(mk);
        if (i === undefined) continue;
        months[i].booked_jobs += 1;
      }
    }
  } catch {
    // ignore
  }

  // 3C) Revenue (completed SmartSend-counted roofing jobs)
  try {
    const { data: jobs } = await admin
      .from("roofing_jobs")
      .select("updated_at,projected_job_value")
      .eq("workspace_id", workspaceId)
      .eq("origin_source", "smartsend")
      .eq("current_stage", "COMPLETED")
      .gte("updated_at", windowStartIso)
      .limit(50_000);

    for (const j of (jobs ?? []) as any[]) {
      const mk = monthKeyFromIso(String(j.updated_at));
      const i = idx.get(mk);
      if (i === undefined) continue;
      months[i].completed_revenue += safeNumber(j.projected_job_value);
    }
  } catch {
    // ignore
  }

  // =========================================================
  // 4) Silent trust completion (system tells you if it’s working)
  // =========================================================
  const nextActions: NextAction[] = [];

  if ((pausedCampaigns?.length ?? 0) > 0) {
    nextActions.push({
      label: "Resume outreach",
      reason: `${pausedCampaigns.length} campaign(s) are paused (autopilot can’t run if reach is paused).`,
      url: "/dashboard/campaigns",
    });
  }

  const lastOutboundHours = hoursSince(lastOutboundAt);
  if (lastOutboundHours === null || lastOutboundHours > 48) {
    nextActions.push({
      label: "Check sending continuity",
      reason: lastOutboundAt
        ? `No outbound proof in the last ${Math.floor(lastOutboundHours)}h.`
        : "No outbound proof found yet.",
      url: "/dashboard/queue",
    });
  }

  if (hot.length > 0) {
    nextActions.push({
      label: "Reply to hot homeowners",
      reason: `${hot.length} hot homeowner repl${hot.length === 1 ? "y" : "ies"} waiting.`,
      url: "/dashboard/daily",
    });
  }

  if (stalled.length > 0) {
    nextActions.push({
      label: "Clear stalled estimates",
      reason: `${stalled.length} estimate(s) stalled • ${Math.round(atRisk).toLocaleString()} value at risk (est.).`,
      url: "/dashboard/daily",
    });
  }

  const trustOk = nextActions.length === 0 && (queueErr ? false : true);

  const narrativeLines = months
    .slice()
    .reverse()
    .slice(0, 6)
    .reverse()
    .map((m) => {
      const rr = m.emails_sent > 0 ? Math.round((1000 * m.replies_received) / m.emails_sent) / 10 : 0;
      const rev = Math.round(m.completed_revenue);
      return `- **${m.month}**: ${m.emails_sent.toLocaleString()} sends → ${m.replies_received.toLocaleString()} replies (${rr}%) → ${m.booked_jobs.toLocaleString()} booked → $${rev.toLocaleString()} completed`;
    })
    .join("\n");

  const narrative = [
    `Input → Conversations → Jobs → Revenue`,
    ``,
    narrativeLines || "- No history yet.",
  ].join("\n");

  return NextResponse.json(
    {
      ok: true,
      as_of: nowIso,
      workspace_id: workspaceId,
      system: {
        autopilot,
        institutional_policy_locked: Boolean(workspace?.institutional_policy_locked ?? false),
        institutional_policy_locked_at: workspace?.institutional_policy_locked_at ?? null,
        outreach_state: workspace?.outreach_state ?? null,
        campaigns: {
          active_count: activeCampaignsCount ?? 0,
          paused_count: pausedCampaigns.length,
        },
        last_outbound_at: lastOutboundAt,
      },
      today: {
        queue: {
          total: queueItems.length,
          hot_replies: hot.length,
          stalled_estimates: stalled.length,
          followups_due: due.length,
          value_at_risk: Math.round(atRisk),
        },
      },
      story: {
        window_start: windowStartIso,
        months,
        narrative_markdown: narrative,
      },
      trust: {
        ok: trustOk,
        next_actions: nextActions,
      },
      warnings: {
        daily_queue_error: queueErr ? "Daily operator queue unavailable (check DB view + RLS)." : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}



