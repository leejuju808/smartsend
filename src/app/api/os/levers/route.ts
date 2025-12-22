import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import {
  normalizeDemandThrottle,
  nonNegativeIntOrNull,
  throttleDailyCap,
  isCapacityFull,
  fullSignalMessage,
} from "@/lib/capacity/control";
import { blockIfAutopilotEnabled, getAutopilotSnapshot } from "@/lib/autopilot/guard";
import { blockIfProvenPathLocked, getProvenPathLock, isValidDeviationReason } from "@/lib/authority/guard";
import { requireDecisionForAction } from "@/lib/decisions/guard";

async function ensureMember(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  workspaceId: string,
  userId: string
) {
  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Membership check failed");
  if (!membership) throw new Error("Forbidden");
  return String((membership as any).role || "");
}

function utcStartOfTodayIso() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    await ensureMember(supabase, workspaceId, user.id);

    // BLOCK 273700: proven-path lock snapshot (best-effort; older DBs won't have it yet).
    const proven = await getProvenPathLock(workspaceId);

    // BLOCK 272000: area_zip_enabled may not exist in older DBs; fall back gracefully.
    let ws: any = null;
    let areaZipEnabled = false;
    let autopilotSnapshot = {
      enabled: false,
      enabled_at: null as string | null,
      locked: false,
      locked_at: null as string | null,
      lock_days: 14,
    };
    try {
      const { data, error } = await supabaseAdmin
        .from("workspaces")
        .select(
          "id, demand_throttle, crew_capacity_jobs, area_zip_enabled, autopilot_enabled, autopilot_enabled_at, autopilot_locked, autopilot_locked_at, autopilot_lock_days"
        )
        .eq("id", workspaceId)
        .maybeSingle();
      if (error) throw error;
      ws = data;
      areaZipEnabled = Boolean((ws as any)?.area_zip_enabled);
      autopilotSnapshot = await getAutopilotSnapshot(workspaceId);
    } catch {
      const { data } = await supabaseAdmin
        .from("workspaces")
        .select("id, demand_throttle, crew_capacity_jobs")
        .eq("id", workspaceId)
        .maybeSingle();
      ws = data;
      areaZipEnabled = false;
      autopilotSnapshot = await getAutopilotSnapshot(workspaceId);
    }

    const throttle = normalizeDemandThrottle((ws as any)?.demand_throttle);
    const dailyCap = throttleDailyCap(throttle);
    const crewCapacityJobs = nonNegativeIntOrNull((ws as any)?.crew_capacity_jobs);

    // Sent today (workspace-level)
    let sentToday = 0;
    try {
      const { data: rows } = await supabaseAdmin.rpc("ss_send_queue_sent_today_counts", {
        p_workspace_ids: [workspaceId],
      });
      sentToday = Number((rows as any)?.[0]?.sent_today ?? 0);
    } catch {
      sentToday = 0;
    }

    // Conversations today (best-effort)
    let conversationsToday = 0;
    try {
      const start = utcStartOfTodayIso();
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("replied_at", start);
      conversationsToday = count ?? 0;
    } catch {
      conversationsToday = 0;
    }

    // Jobs closed today (best-effort)
    let jobsClosedToday = 0;
    try {
      const start = utcStartOfTodayIso();
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("pipeline_stage", "won")
        .gte("closed_at", start);
      jobsClosedToday = count ?? 0;
    } catch {
      jobsClosedToday = 0;
    }

    // Open jobs + capacity full signal
    let openJobs = 0;
    try {
      const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", {
        p_workspace_ids: [workspaceId],
      });
      openJobs = Number((openRows as any)?.[0]?.open_jobs ?? 0);
    } catch {
      openJobs = 0;
    }
    const full = isCapacityFull(openJobs, crewCapacityJobs);

    // Area pool sizes (best-effort)
    let homeownerPoolAll = 0;
    let homeownerPoolInServiceArea = 0;
    try {
      const { count } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      homeownerPoolAll = count ?? 0;
    } catch {
      homeownerPoolAll = 0;
    }
    try {
      const { count } = await supabaseAdmin
        .from("lead_locations")
        .select("lead_id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("is_in_service_area", true);
      homeownerPoolInServiceArea = count ?? 0;
    } catch {
      homeownerPoolInServiceArea = 0;
    }

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        as_of: new Date().toISOString(),
        autopilot: autopilotSnapshot,
        authority: {
          proven_path_locked: proven.locked,
          proven_path_locked_at: proven.locked_at,
        },
        levers: {
          volume: throttle, // low|normal|high
          area_zip_enabled: areaZipEnabled, // boolean
          capacity_crews_x: crewCapacityJobs, // int|null
        },
        immediate_effect: {
          volume_daily_cap: dailyCap,
          homeowners_contacted_today: sentToday,
          homeowners_contacted_remaining_today: Math.max(0, dailyCap - sentToday),
          conversations_today: conversationsToday,
          jobs_closed_today: jobsClosedToday,
          area_pool_all: homeownerPoolAll,
          area_pool_in_service_area: homeownerPoolInServiceArea,
          area_pool_effective: areaZipEnabled ? homeownerPoolAll : homeownerPoolInServiceArea,
        },
        capacity_status: {
          jobs_booked_open: openJobs,
          is_full: full,
          message: fullSignalMessage(full),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    const role = await ensureMember(supabase, workspaceId, user.id);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const autopilotGate = await blockIfAutopilotEnabled({
      req,
      workspaceId,
      action: "OS levers (volume/area/capacity)",
    });
    if (autopilotGate.blocked) return autopilotGate.response;

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["os_levers"],
      requireChoice: "act",
    });
    if (decisionGate.blocked) return decisionGate.response;

    const reason = (body as any)?.reason;
    if (!isValidDeviationReason(reason)) {
      return NextResponse.json(
        { error: "reason required", allowed_reasons: ["capacity_change", "crew_change", "geographic_expansion"] },
        { status: 400 }
      );
    }
    const demandThrottle = normalizeDemandThrottle((body as any)?.volume);
    const areaZipEnabled = Boolean((body as any)?.area_zip_enabled);
    const crewCapacityJobs = nonNegativeIntOrNull((body as any)?.capacity_crews_x);

    const lockGate = await blockIfProvenPathLocked({
      req,
      workspaceId,
      action: "OS levers (volume/area/capacity)",
      createdBy: user.id,
      reason,
      target: "os_levers",
      requestedChanges: {
        demand_throttle: demandThrottle,
        area_zip_enabled: areaZipEnabled,
        crew_capacity_jobs: crewCapacityJobs,
      },
      evidence: (body as any)?.evidence ?? {},
    });
    if (lockGate.blocked) return lockGate.response;

    // BLOCK 272000: if area_zip_enabled isn't migrated yet, still allow Volume/Capacity to save.
    const updatePayload: any = {
      demand_throttle: demandThrottle,
      crew_capacity_jobs: crewCapacityJobs,
      area_zip_enabled: areaZipEnabled,
    };

    // IMPORTANT (Block 272900):
    // Write with the authenticated client so DB triggers can attribute this change to the owner (auth.uid()).
    const { error: updErr } = await supabase.from("workspaces").update(updatePayload).eq("id", workspaceId);

    if (updErr) {
      if (String(updErr.message || "").includes("System performance indicates continuation")) {
        return NextResponse.json({ error: "System performance indicates continuation." }, { status: 423 });
      }
      // Retry without area_zip_enabled for older schemas.
      const { error: retryErr } = await supabase
        .from("workspaces")
        .update({ demand_throttle: demandThrottle, crew_capacity_jobs: crewCapacityJobs } as any)
        .eq("id", workspaceId);
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
    }

    // return fresh snapshot
    return await GET();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}



