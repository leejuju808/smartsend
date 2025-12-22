import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isCapacityFull, nonNegativeIntOrNull, normalizeDemandThrottle, type DemandThrottle } from "@/lib/capacity/control";

function authorize(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key");
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return key && key === expected;
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function computeSignals(workspaceId: string) {
  const since7d = isoDaysAgo(7);
  const since14d = isoDaysAgo(14);

  // Replies (proxy): leads replied_at in last 7 days
  let replies7d = 0;
  try {
    const { count } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("replied_at", since7d);
    replies7d = count ?? 0;
  } catch {}

  // Sends (proxy): send_queue sent in last 7 days
  let sends7d = 0;
  try {
    const { count } = await supabaseAdmin
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["sent", "delivered"])
      .gte("updated_at", since7d);
    sends7d = count ?? 0;
  } catch {}

  // Close velocity: won in last 14 days (coarse)
  let won14d = 0;
  try {
    const { count } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("pipeline_stage", "won")
      .gte("closed_at", since14d);
    won14d = count ?? 0;
  } catch {}

  return {
    replies_7d: replies7d,
    sends_7d: sends7d,
    reply_health_7d: sends7d > 0 ? replies7d / sends7d : 0,
    wins_14d: won14d,
  };
}

function nextThrottle(current: DemandThrottle, dir: "up" | "down" | "hold"): DemandThrottle {
  const order: DemandThrottle[] = ["low", "normal", "high"];
  const idx = Math.max(0, order.indexOf(current));
  if (dir === "hold") return current;
  if (dir === "up") return order[Math.min(order.length - 1, idx + 1)];
  return order[Math.max(0, idx - 1)];
}

/**
 * POST /api/cron/autopilot-growth
 * System-decided growth controller:
 * - Reads reply health, close velocity, capacity
 * - Adjusts workspace levers: demand_throttle, area_zip_enabled, reliability_followup_multiplier
 * - Logs every decision to autopilot_decisions
 */
export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const nowIso = new Date().toISOString();
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, demand_throttle, crew_capacity_jobs, area_zip_enabled, autopilot_enabled, outreach_state, reliability_followup_multiplier")
      .eq("autopilot_enabled", true)
      .limit(5000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (workspaces || []).map((w: any) => String(w.id)).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ ok: true, processed: 0 });

    const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", { p_workspace_ids: ids }).catch(() => ({ data: [] as any[] }));
    const openByWs = new Map<string, number>();
    for (const r of (openRows || []) as any[]) openByWs.set(String(r.workspace_id), Number(r.open_jobs || 0));

    let processed = 0;
    let changed = 0;

    for (const ws of (workspaces || []) as any[]) {
      const workspaceId = String(ws.id || "");
      if (!workspaceId) continue;
      processed++;

      // If workspace is paused, we still log "hold" but do not change levers (no thrash).
      const outreachState = String(ws.outreach_state || "running");

      const throttleCurrent = normalizeDemandThrottle(ws.demand_throttle);
      const areaCurrent = Boolean(ws.area_zip_enabled);
      const followupMultCurrentRaw = Number(ws.reliability_followup_multiplier ?? 1);
      const followupMultCurrent = Number.isFinite(followupMultCurrentRaw) ? followupMultCurrentRaw : 1;

      const crewCap = nonNegativeIntOrNull(ws.crew_capacity_jobs);
      const openJobs = openByWs.get(workspaceId) ?? 0;
      const full = isCapacityFull(openJobs, crewCap);

      const signals = await computeSignals(workspaceId);

      // Mechanical policy:
      // - If full: slow outbound + tighten area (protect ops)
      // - Else if reply health is strong and wins exist: scale up + expand area
      // - Else if reply health is weak: scale down + tighten followup pressure slightly (avoid spam)
      // - Else: hold
      let dir: "up" | "down" | "hold" = "hold";
      let nextArea = areaCurrent;
      let nextFollowupMultiplier = followupMultCurrent;
      let reason = "hold";

      if (outreachState !== "running") {
        dir = "hold";
        nextArea = areaCurrent;
        nextFollowupMultiplier = followupMultCurrent;
        reason = "workspace_paused_hold";
      } else if (full) {
        dir = "down";
        nextArea = false;
        nextFollowupMultiplier = Math.min(1.5, Math.max(0.75, followupMultCurrent + 0.15));
        reason = "capacity_full_slow";
      } else if (signals.reply_health_7d >= 0.03 && signals.wins_14d >= 2) {
        dir = "up";
        nextArea = true;
        nextFollowupMultiplier = Math.max(0.75, Math.min(1.25, followupMultCurrent - 0.1));
        reason = "healthy_replies_and_wins_scale";
      } else if (signals.reply_health_7d > 0 && signals.reply_health_7d < 0.01) {
        dir = "down";
        nextArea = false;
        nextFollowupMultiplier = Math.min(1.5, Math.max(0.9, followupMultCurrent + 0.1));
        reason = "weak_replies_de_risk";
      } else {
        dir = "hold";
        reason = "steady_state";
      }

      const throttleNext = nextThrottle(throttleCurrent, dir);

      const changes: any = {
        demand_throttle: { from: throttleCurrent, to: throttleNext },
        area_zip_enabled: { from: areaCurrent, to: nextArea },
        reliability_followup_multiplier: { from: followupMultCurrent, to: nextFollowupMultiplier },
      };

      const willChange =
        throttleNext !== throttleCurrent ||
        nextArea !== areaCurrent ||
        Math.abs(nextFollowupMultiplier - followupMultCurrent) >= 0.001;

      // Always log decisions (proof trail), even if hold/no change.
      try {
        await supabaseAdmin.from("autopilot_decisions").insert({
          workspace_id: workspaceId,
          decided_at: nowIso,
          actor: "system",
          reason,
          metrics: {
            open_jobs: openJobs,
            crew_capacity_jobs: crewCap,
            capacity_full: full,
            ...signals,
          },
          changes,
        } as any);
      } catch {}

      if (outreachState !== "running") continue;
      if (!willChange) continue;

      await supabaseAdmin
        .from("workspaces")
        .update({
          demand_throttle: throttleNext,
          area_zip_enabled: nextArea,
          reliability_followup_multiplier: nextFollowupMultiplier,
        } as any)
        .eq("id", workspaceId);

      changed++;
    }

    return NextResponse.json({ ok: true, processed, changed });
  } catch (e: any) {
    console.error("autopilot-growth cron error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}




