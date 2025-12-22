// Block 255400 — Field Operations Command v1
// API Route: PM Control Center Dashboard
// GET /api/field-ops/pm-dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get PM dashboard data using helper function
    const { data: dashboardData, error: dashboardError } = await supabase.rpc(
      "get_pm_dashboard_data",
      {
        p_workspace_id: workspaceId,
        p_date: date,
      }
    );

    if (dashboardError) {
      console.error("Error fetching PM dashboard data:", dashboardError);
      // Fallback to manual query if function doesn't work
      return await getDashboardDataFallback(supabase, workspaceId, date);
    }

    // Enhance with additional data
    const enhancedData = await Promise.all(
      (dashboardData || []).map(async (job: any) => {
        // Get latest GPS for crew
        const { data: latestGps } = await supabase
          .from("crew_gps_logs")
          .select("lat, lng, timestamp")
          .eq("crew_id", job.crew_id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        // Get material shortages (if material_usage table exists)
        const { data: materials } = await supabase
          .from("material_usage")
          .select("material_name, quantity")
          .eq("job_id", job.job_id);

        // Calculate risk flags
        const riskFlags: string[] = [];
        if (job.punchlist_critical_count > 0) {
          riskFlags.push("Critical punchlist items");
        }
        if (job.progress_percent < 50 && new Date().getHours() > 14) {
          riskFlags.push("Low progress for time of day");
        }

        return {
          ...job,
          latest_gps: latestGps || null,
          material_shortages: materials?.length === 0 ? ["Materials not reported"] : [],
          risk_flags: riskFlags,
        };
      })
    );

    return NextResponse.json(
      {
        jobs: enhancedData,
        date,
        total_jobs: enhancedData.length,
        jobs_on_site: enhancedData.filter((j: any) => j.crew_status === "on_site").length,
        jobs_en_route: enhancedData.filter((j: any) => j.crew_status === "en_route").length,
        jobs_finished: enhancedData.filter((j: any) => j.crew_status === "finished").length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in PM dashboard endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// Fallback function if RPC doesn't work
async function getDashboardDataFallback(
  supabase: any,
  workspaceId: string,
  date: string
) {
  try {
    // Get all active jobs for today
    const { data: jobs } = await supabase
      .from("roofing_jobs")
      .select(
        `
        id,
        title,
        address,
        scheduled_start_date,
        status,
        job_type,
        job_crews!inner(
          crew_id,
          is_primary,
          crews(
            id,
            name
          )
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .in("status", ["scheduled", "in_progress"])
      .or(`scheduled_start_date.eq.${date},scheduled_start_date.is.null`);

    const dashboardJobs = await Promise.all(
      (jobs || []).map(async (job: any) => {
        const primaryCrew = job.job_crews?.find((jc: any) => jc.is_primary);
        const crew = primaryCrew?.crews;

        // Get latest GPS
        const { data: latestGps } = await supabase
          .from("crew_gps_logs")
          .select("lat, lng, timestamp")
          .eq("crew_id", crew?.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        // Get latest status
        const { data: latestStatus } = await supabase
          .from("jobsite_status_updates")
          .select("status, timestamp")
          .eq("job_id", job.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();

        // Get punchlist counts
        const { data: punchlists } = await supabase
          .from("punchlists")
          .select("id, priority")
          .eq("job_id", job.id)
          .in("status", ["open", "in_progress"]);

        const openCount = punchlists?.length || 0;
        const criticalCount =
          punchlists?.filter((p: any) => p.priority === "critical").length || 0;

        // Determine crew status
        let crewStatus = "en_route";
        if (latestStatus) {
          if (latestStatus.status === "completed") {
            crewStatus = "finished";
          } else if (
            ["arrived", "setup", "tearoff", "install_underlayment", "shingles", "ridge", "cleanup"].includes(
              latestStatus.status
            )
          ) {
            crewStatus = "on_site";
          }
        }

        return {
          job_id: job.id,
          job_title: job.title || "Untitled Job",
          address: job.address || "No address",
          crew_id: crew?.id,
          crew_name: crew?.name,
          crew_gps_lat: latestGps?.lat,
          crew_gps_lng: latestGps?.lng,
          crew_status: crewStatus,
          progress_percent: 0, // Can be calculated from timeline
          current_status: latestStatus?.status,
          predicted_finish_time: null,
          punchlist_open_count: openCount,
          punchlist_critical_count: criticalCount,
          material_shortages: [],
          risk_flags: [],
          next_crew_availability: null,
        };
      })
    );

    return NextResponse.json(
      {
        jobs: dashboardJobs,
        date,
        total_jobs: dashboardJobs.length,
        jobs_on_site: dashboardJobs.filter((j: any) => j.crew_status === "on_site").length,
        jobs_en_route: dashboardJobs.filter((j: any) => j.crew_status === "en_route").length,
        jobs_finished: dashboardJobs.filter((j: any) => j.crew_status === "finished").length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    throw error;
  }
}





















