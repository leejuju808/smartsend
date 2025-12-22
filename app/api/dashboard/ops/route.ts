// Block 24740 — SmartSend Roofing Ops Dashboard v1
// API Route: Get Operations Dashboard Data
// Returns all dashboard panels: today's jobs, revenue, crew load, materials, insurance, health, actions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Fetch all dashboard data in parallel
    const [
      todayJobsResult,
      revenueResult,
      crewLoadResult,
      materialIssuesResult,
      insuranceResult,
      healthResult,
      actionsResult,
    ] = await Promise.all([
      // Panel 1: Today's Jobs
      supabase
        .from("ops_dashboard_today_jobs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("scheduled_start_date", { ascending: true }),

      // Panel 2: Revenue Tracking
      supabase.rpc("get_ops_dashboard_revenue", {
        p_workspace_id: workspaceId,
      }),

      // Panel 3: Crew Load
      supabase
        .from("ops_dashboard_crew_load")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("crew_name", { ascending: true }),

      // Panel 4: Material Issues
      supabase
        .from("ops_dashboard_material_issues")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("expected_delivery_date", { ascending: true }),

      // Panel 5: Insurance Progress
      supabase
        .from("ops_dashboard_insurance_progress")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),

      // Panel 6: Job Health Overview
      supabase.rpc("get_ops_dashboard_job_health", {
        p_workspace_id: workspaceId,
      }),

      // Panel 7: Action Suggestions
      supabase.rpc("get_ops_dashboard_action_suggestions", {
        p_workspace_id: workspaceId,
      }),
    ]);

    // Check for errors
    if (todayJobsResult.error) {
      console.error("Error fetching today's jobs:", todayJobsResult.error);
    }
    if (revenueResult.error) {
      console.error("Error fetching revenue:", revenueResult.error);
    }
    if (crewLoadResult.error) {
      console.error("Error fetching crew load:", crewLoadResult.error);
    }
    if (materialIssuesResult.error) {
      console.error("Error fetching material issues:", materialIssuesResult.error);
    }
    if (insuranceResult.error) {
      console.error("Error fetching insurance:", insuranceResult.error);
    }
    if (healthResult.error) {
      console.error("Error fetching health:", healthResult.error);
    }
    if (actionsResult.error) {
      console.error("Error fetching actions:", actionsResult.error);
    }

    // Aggregate insurance stats
    const insuranceJobs = insuranceResult.data || [];
    const insuranceStats = {
      total: insuranceJobs.length,
      acv_pending: insuranceJobs.filter((j: any) => j.acv_status === "pending")
        .length,
      acv_paid: insuranceJobs.filter((j: any) => j.acv_status === "paid")
        .length,
      supplements_pending: insuranceJobs.filter(
        (j: any) =>
          j.supplement_status === "submitted" ||
          j.supplement_status === "pending"
      ).length,
      supplements_approved: insuranceJobs.filter(
        (j: any) => j.supplement_status === "approved"
      ).length,
      depreciation_pending: insuranceJobs.filter(
        (j: any) => j.depreciation_status === "pending"
      ).length,
      adjuster_visits_today: insuranceJobs.filter(
        (j: any) => j.adjuster_visit_today === true
      ).length,
    };

    return NextResponse.json(
      {
        today_jobs: todayJobsResult.data || [],
        revenue: revenueResult.data || {},
        crew_load: crewLoadResult.data || [],
        material_issues: materialIssuesResult.data || [],
        insurance: {
          jobs: insuranceJobs,
          stats: insuranceStats,
        },
        job_health: healthResult.data || {},
        action_suggestions: actionsResult.data || {},
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Ops dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































