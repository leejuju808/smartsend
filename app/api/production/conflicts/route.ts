// API Route: Get scheduling conflicts
// GET /api/production/conflicts?resolved=false

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resolved = searchParams.get("resolved");

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ conflicts: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Build query
    let query = supabase
      .from("schedule_conflicts")
      .select(`
        id,
        conflict_type,
        severity,
        schedule_id_1,
        schedule_id_2,
        job_id_1,
        job_id_2,
        crew_id,
        conflict_date,
        details,
        resolved,
        resolved_at,
        resolution_action,
        jobs_1:roofing_jobs!schedule_conflicts_job_id_1_fkey (
          id,
          title,
          homeowner_name,
          address
        ),
        jobs_2:roofing_jobs!schedule_conflicts_job_id_2_fkey (
          id,
          title,
          homeowner_name,
          address
        ),
        crews (
          id,
          name
        )
      `)
      .in("workspace_id", workspaceIds)
      .order("conflict_date", { ascending: true })
      .order("severity", { ascending: false });

    if (resolved === "false" || resolved === null) {
      query = query.eq("resolved", false);
    } else if (resolved === "true") {
      query = query.eq("resolved", true);
    }

    const { data: conflicts, error } = await query;

    if (error) throw error;

    // Format response
    const formattedConflicts = (conflicts || []).map((conflict: any) => ({
      id: conflict.id,
      conflict_type: conflict.conflict_type,
      severity: conflict.severity,
      schedule_id_1: conflict.schedule_id_1,
      schedule_id_2: conflict.schedule_id_2,
      job_id: conflict.job_id_1,
      job_id_2: conflict.job_id_2,
      crew_id: conflict.crew_id,
      conflict_date: conflict.conflict_date,
      details: conflict.details,
      resolved: conflict.resolved,
      resolved_at: conflict.resolved_at,
      resolution_action: conflict.resolution_action,
      job: conflict.jobs_1 ? {
        id: conflict.jobs_1.id,
        title: conflict.jobs_1.title || `Job ${conflict.jobs_1.id.slice(0, 8)}`,
        homeowner_name: conflict.jobs_1.homeowner_name,
      } : null,
      job_2: conflict.jobs_2 ? {
        id: conflict.jobs_2.id,
        title: conflict.jobs_2.title || `Job ${conflict.jobs_2.id.slice(0, 8)}`,
        homeowner_name: conflict.jobs_2.homeowner_name,
      } : null,
      crew: conflict.crews ? {
        id: conflict.crews.id,
        name: conflict.crews.name,
      } : null,
    }));

    return NextResponse.json({ conflicts: formattedConflicts });
  } catch (error: any) {
    console.error("Error fetching conflicts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































