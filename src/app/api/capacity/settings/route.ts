import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { fullSignalMessage, isCapacityFull, nonNegativeIntOrNull, normalizeDemandThrottle } from "@/lib/capacity/control";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";
import { blockIfProvenPathLocked, isValidDeviationReason } from "@/lib/authority/guard";
import { requireDecisionForAction } from "@/lib/decisions/guard";

async function ensureMember(supabase: ReturnType<typeof createRouteHandlerClient>, workspaceId: string, userId: string) {
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

    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, demand_throttle, crew_capacity_jobs")
      .eq("id", workspaceId)
      .maybeSingle();

    const throttle = normalizeDemandThrottle((ws as any)?.demand_throttle);
    const crewCapacity = nonNegativeIntOrNull((ws as any)?.crew_capacity_jobs);

    const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", {
      p_workspace_ids: [workspaceId],
    });
    const openJobs = Number((openRows as any)?.[0]?.open_jobs ?? 0);

    const isFull = isCapacityFull(openJobs, crewCapacity);

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        settings: {
          demand_throttle: throttle,
          crew_capacity_jobs: crewCapacity,
        },
        status: {
          jobs_booked_open: openJobs,
          is_full: isFull,
          message: fullSignalMessage(isFull),
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
      action: "Capacity settings (volume/capacity)",
    });
    if (autopilotGate.blocked) return autopilotGate.response;

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["capacity_settings"],
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
    const throttle = normalizeDemandThrottle((body as any)?.demand_throttle);
    const crewCapacity = nonNegativeIntOrNull((body as any)?.crew_capacity_jobs);

    const lockGate = await blockIfProvenPathLocked({
      req,
      workspaceId,
      action: "Capacity settings (volume/capacity)",
      createdBy: user.id,
      reason,
      target: "capacity_settings",
      requestedChanges: { demand_throttle: throttle, crew_capacity_jobs: crewCapacity },
      evidence: (body as any)?.evidence ?? {},
    });
    if (lockGate.blocked) return lockGate.response;

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .update({
        demand_throttle: throttle,
        crew_capacity_jobs: crewCapacity,
      })
      .eq("id", workspaceId)
      .select("id, demand_throttle, crew_capacity_jobs")
      .maybeSingle();

    if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

    const { data: openRows } = await supabaseAdmin.rpc("ss_open_jobs_by_workspace", {
      p_workspace_ids: [workspaceId],
    });
    const openJobs = Number((openRows as any)?.[0]?.open_jobs ?? 0);

    const cap = nonNegativeIntOrNull((ws as any)?.crew_capacity_jobs);
    const isFull = isCapacityFull(openJobs, cap);

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        settings: {
          demand_throttle: normalizeDemandThrottle((ws as any)?.demand_throttle),
          crew_capacity_jobs: nonNegativeIntOrNull((ws as any)?.crew_capacity_jobs),
        },
        status: {
          jobs_booked_open: openJobs,
          is_full: isFull,
          message: fullSignalMessage(isFull),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





