import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fullSignalMessage, isCapacityFull, nonNegativeIntOrNull, normalizeDemandThrottle } from "@/lib/capacity/control";

function utcDay(d = new Date()) {
  // YYYY-MM-DD in UTC (matches ss_outreach_daily_log.day)
  return d.toISOString().slice(0, 10);
}

function utcDateOnly(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function diffDaysUtc(a: Date, b: Date): number {
  // a - b in whole days (UTC-midnight based)
  const ms = utcDateOnly(a).getTime() - utcDateOnly(b).getTime();
  return Math.floor(ms / 86_400_000);
}

/**
 * GET /api/outreach/status?workspace_id=...
 * Returns:
 * - workspace outreach_state (running/paused)
 * - paused_at (if paused)
 * - daily proof-of-life (ran_today)
 * - never-reset revenue memory (jobs booked/closed/value)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: wsRow } = await supabaseAdmin
      .from("workspaces")
      .select(
        "id, created_at, outreach_state, outreach_paused_at, outreach_paused_reason, outreach_last_paused_at, outreach_last_resumed_at, demand_throttle, crew_capacity_jobs"
      )
      .eq("id", workspaceId)
      .maybeSingle();

    const outreachState = String((wsRow as any)?.outreach_state || "running");
    const pausedAt = (wsRow as any)?.outreach_paused_at || null;
    const pausedReason = (wsRow as any)?.outreach_paused_reason || null;

    // BLOCK 270800: “You’re Full” signal + crew-aware snapshot
    let capacity: any = null;
    try {
      const demandThrottle = normalizeDemandThrottle((wsRow as any)?.demand_throttle);
      const crewCapacityJobs = nonNegativeIntOrNull((wsRow as any)?.crew_capacity_jobs);

      const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", {
        p_workspace_ids: [workspaceId],
      });
      const openJobs = Number((openRows as any)?.[0]?.open_jobs ?? 0);
      const isFull = isCapacityFull(openJobs, crewCapacityJobs);

      capacity = {
        demand_throttle: demandThrottle,
        crew_capacity_jobs: crewCapacityJobs,
        jobs_booked_open: openJobs,
        is_full: isFull,
        message: fullSignalMessage(isFull),
      };
    } catch {
      capacity = null;
    }

    // BLOCK 269500: while paused, "revenue memory" should feel frozen (paused days don't add).
    // So: when PAUSED, read the last stored proof stack; when RUNNING, recompute.
    let revenueMemory: any = null;
    let startedAtIso: string | null = null;
    if (outreachState === "paused") {
      try {
        const { data: stackRow } = await supabaseAdmin
          .from("ss_moat_proof_stack")
          .select("updated_at, started_at, jobs_booked_all_time, estimated_value_all_time, jobs_closed_all_time, revenue_closed_all_time")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        if (stackRow) {
          startedAtIso = (stackRow as any).started_at || null;
          revenueMemory = {
            workspace_id: workspaceId,
            as_of: (stackRow as any).updated_at || null,
            jobs_booked: (stackRow as any).jobs_booked_all_time ?? 0,
            estimated_value: (stackRow as any).estimated_value_all_time ?? 0,
            jobs_closed: (stackRow as any).jobs_closed_all_time ?? 0,
            revenue_closed: (stackRow as any).revenue_closed_all_time ?? 0,
          };
        }
      } catch {
        revenueMemory = null;
      }
    } else {
      const recompute = await supabaseAdmin.rpc("ss_moat_recompute", { p_workspace_id: workspaceId }).catch(() => null);
      // supabase-js returns { data, error } for rpc; preserve previous behavior but extract started_at if present.
      startedAtIso = (recompute as any)?.data?.started_at ?? (recompute as any)?.started_at ?? null;
      revenueMemory = recompute;
    }

    const { data: logRow } = await supabaseAdmin
      .from("ss_outreach_daily_log")
      .select("ran_at")
      .eq("workspace_id", workspaceId)
      .eq("day", utcDay())
      .maybeSingle();

    // BLOCK 274600: Time asymmetry snapshot (brutal, personal)
    // Derive:
    // - days_running: days with proof-of-life since started_at
    // - days_idle: total days since started_at minus running days
    // - gap_days: days since last proof-of-life day (current momentum gap)
    const today = utcDateOnly(new Date());
    const wsCreatedAtIso = ((wsRow as any)?.created_at as string | null) ?? null;
    const anchorIso = startedAtIso || wsCreatedAtIso;
    const anchorDate = anchorIso ? utcDateOnly(new Date(anchorIso)) : today;
    const daysTotal = Math.max(0, diffDaysUtc(today, anchorDate) + 1);

    let daysRunning = 0;
    let lastRanDay: string | null = null;
    try {
      const startDay = anchorDate.toISOString().slice(0, 10);
      const endDay = utcDay();

      const [{ count: runningCount }, { data: lastRow }] = await Promise.all([
        supabaseAdmin
          .from("ss_outreach_daily_log")
          .select("day", { head: true, count: "exact" })
          .eq("workspace_id", workspaceId)
          .gte("day", startDay)
          .lte("day", endDay),
        supabaseAdmin
          .from("ss_outreach_daily_log")
          .select("day")
          .eq("workspace_id", workspaceId)
          .order("day", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      daysRunning = Math.max(0, Number(runningCount ?? 0));
      lastRanDay = (lastRow as any)?.day ?? null;
    } catch {
      daysRunning = 0;
      lastRanDay = null;
    }

    const daysIdle = Math.max(0, daysTotal - daysRunning);
    const gapDays =
      !lastRanDay ? daysTotal : Math.max(0, diffDaysUtc(today, utcDateOnly(new Date(`${lastRanDay}T00:00:00Z`))));

    // Restart ≠ Reset (enforced via send ramp); expose the currently-active penalty window.
    const lastPausedAt = ((wsRow as any)?.outreach_last_paused_at as string | null) ?? null;
    const lastResumedAt = ((wsRow as any)?.outreach_last_resumed_at as string | null) ?? null;
    let restartPenalty: any = { active: false, days_remaining: 0, multiplier: 1 };
    try {
      if (lastPausedAt && lastResumedAt) {
        const paused = new Date(lastPausedAt);
        const resumed = new Date(lastResumedAt);
        if (Number.isFinite(paused.getTime()) && Number.isFinite(resumed.getTime()) && resumed.getTime() > paused.getTime()) {
          const pauseDays = diffDaysUtc(resumed, paused);
          const daysSinceResume = diffDaysUtc(today, resumed);
          const windowDays = 7;
          const active = pauseDays >= 1 && daysSinceResume >= 0 && daysSinceResume < windowDays;
          const daysRemaining = active ? Math.max(0, windowDays - daysSinceResume) : 0;
          const multiplier =
            !active
              ? 1
              : daysSinceResume <= 1
                ? 0.25
                : daysSinceResume <= 3
                  ? 0.5
                  : daysSinceResume <= 6
                    ? 0.75
                    : 1;
          restartPenalty = { active, days_remaining: daysRemaining, multiplier };
        }
      }
    } catch {
      restartPenalty = { active: false, days_remaining: 0, multiplier: 1 };
    }

    return NextResponse.json(
      {
        workspace_id: workspaceId,
        outreach: {
          state: outreachState,
          paused_at: pausedAt,
          paused_reason: pausedReason,
        },
        capacity,
        proof_of_life: {
          day: utcDay(),
          ran_today: !!logRow?.ran_at,
          ran_at: (logRow as any)?.ran_at || null,
        },
        time_asymmetry: {
          started_at: anchorIso,
          days_running: daysRunning,
          days_idle: daysIdle,
          days_total: daysTotal,
          gap_days: gapDays,
          last_ran_day: lastRanDay,
          restart_penalty: restartPenalty,
        },
        revenue_memory: revenueMemory,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("outreach/status error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}






