import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(num(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

    const { data: rows, error } = await supabaseAdmin.rpc("ss_growth_ceiling_metrics", {
      p_workspace_id: workspaceId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const r = (rows as any)?.[0];
    if (!r) return NextResponse.json({ error: "No metrics available" }, { status: 500 });

    const demandGenerated = num(r.demand_generated_jobs_per_month);
    const demandFulfilled = num(r.demand_fulfilled_jobs_per_month);
    const capacityPerMonth = num(r.capacity_jobs_per_month);
    const avgJobValue = num(r.avg_approved_job_value);
    const addlPerCrew = num(r.additional_jobs_per_month_per_crew);

    const ceilingMoreJobs = Math.max(0, capacityPerMonth - demandGenerated);
    const demandGapJobs = Math.max(0, demandGenerated - demandFulfilled);
    const demandGapValue = demandGapJobs * avgJobValue;

    const demandExceedsCapacity = demandGenerated > capacityPerMonth && capacityPerMonth > 0;
    const addCrewJobsCaptured = demandExceedsCapacity ? Math.min(addlPerCrew, Math.max(0, demandGenerated - capacityPerMonth)) : 0;
    const addCrewRevenue = addCrewJobsCaptured * avgJobValue;

    const crewCapacityJobs = r.crew_capacity_jobs === null || r.crew_capacity_jobs === undefined ? null : clampInt(r.crew_capacity_jobs, 0, 1000000, 0);
    const openJobs = Math.max(0, Math.floor(num(r.open_jobs)));
    const isFull = crewCapacityJobs !== null && crewCapacityJobs > 0 ? openJobs >= crewCapacityJobs : false;

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        as_of: new Date().toISOString(),
        settings: {
          crew_workdays_per_month: clampInt(r.workdays_per_month, 1, 31, 22),
          crew_extended_hours: Boolean(r.extended_hours),
        },
        inputs: {
          crew_count: clampInt(r.crew_count, 0, 1000000, 0),
          avg_job_duration_days: num(r.avg_job_duration_days),
          avg_job_duration_source: String(r.avg_job_duration_source || ""),
          avg_approved_job_value: avgJobValue,
        },
        capacity: {
          jobs_per_month: capacityPerMonth,
          additional_jobs_per_month_per_crew: addlPerCrew,
          crew_capacity_jobs: crewCapacityJobs,
          open_jobs: openJobs,
          is_full: isFull,
        },
        demand: {
          generated_jobs_per_month: demandGenerated,
          fulfilled_jobs_per_month: demandFulfilled,
          gap_jobs_per_month: demandGapJobs,
          gap_value_per_month: demandGapValue,
        },
        ceiling: {
          more_jobs_per_month_at_current_capacity: ceilingMoreJobs,
        },
        add_crew: {
          would_capture_jobs_per_month: addCrewJobsCaptured,
          would_capture_revenue_per_month: addCrewRevenue,
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

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["growth_ceiling"],
      requireChoice: "act",
    });
    if (decisionGate.blocked) return decisionGate.response;

    const workdays = clampInt((body as any)?.crew_workdays_per_month, 1, 31, 22);
    const extended = Boolean((body as any)?.crew_extended_hours);

    const { error: updErr } = await supabaseAdmin
      .from("workspaces")
      .update({
        crew_workdays_per_month: workdays,
        crew_extended_hours: extended,
      })
      .eq("id", workspaceId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Return fresh metrics
    return await GET();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





