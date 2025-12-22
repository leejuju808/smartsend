// Block 246000 — Production Command Center Dashboard API
// GET /api/production/dashboard
// Returns complete command center data for production managers

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Get summary statistics
    const { data: summary, error: summaryError } = await supabase.rpc(
      "get_production_command_center_summary",
      { p_workspace_id: workspaceId }
    );

    if (summaryError) {
      console.error("Error fetching summary:", summaryError);
    }

    // Get all active jobs with full details
    const { data: activeJobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        status,
        job_value,
        scheduled_start_date,
        scheduled_end_date,
        address,
        homeowner_name,
        homeowner_phone,
        homeowner_email,
        crew_id,
        crews:crew_id (
          id,
          name,
          foreman_name
        ),
        job_alerts!inner (
          id,
          type,
          severity,
          message,
          is_resolved
        ),
        job_dependencies!inner (
          id,
          dependency_type,
          status,
          description
        )
      `)
      .eq("workspace_id", workspaceId)
      .in("status", ["unscheduled", "scheduled", "in_progress"])
      .order("scheduled_start_date", { ascending: true, nullsFirst: false });

    // Get crews with live status
    const { data: crews, error: crewsError } = await supabase
      .from("crews")
      .select(`
        id,
        name,
        foreman_name,
        foreman_phone,
        is_active
      `)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    // Get recent production events (last 100)
    const { data: recentEvents, error: eventsError } = await supabase
      .from("production_events")
      .select(`
        id,
        event_type,
        message,
        details,
        created_at,
        job_id,
        crew_id,
        jobs:job_id (
          id,
          title,
          address
        ),
        crews:crew_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    // Get active alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("job_alerts")
      .select(`
        id,
        type,
        severity,
        message,
        metadata,
        is_resolved,
        created_at,
        job_id,
        crew_id,
        jobs:job_id (
          id,
          title,
          address
        ),
        crews:crew_id (
          id,
          name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("is_resolved", false)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    // Get job dependencies that are pending or blocked
    const { data: dependencies, error: depsError } = await supabase
      .from("job_dependencies")
      .select(`
        id,
        dependency_type,
        status,
        description,
        notes,
        expected_completion_date,
        job_id,
        jobs:job_id (
          id,
          title,
          address
        )
      `)
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "blocked"])
      .order("expected_completion_date", { ascending: true, nullsFirst: false });

    // Get material orders/deliveries (from job_materials if exists, or production_events)
    const { data: materialEvents, error: materialsError } = await supabase
      .from("production_events")
      .select(`
        id,
        event_type,
        message,
        details,
        created_at,
        job_id,
        jobs:job_id (
          id,
          title,
          address
        )
      `)
      .eq("workspace_id", workspaceId)
      .in("event_type", ["material_ordered", "material_delivered", "material_verified", "material_shortage"])
      .order("created_at", { ascending: false })
      .limit(50);

    // Get weather-related alerts
    const { data: weatherAlerts, error: weatherError } = await supabase
      .from("job_alerts")
      .select(`
        id,
        type,
        severity,
        message,
        metadata,
        created_at,
        job_id,
        jobs:job_id (
          id,
          title,
          address,
          scheduled_start_date
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "weather")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false });

    // Calculate profitability risks (jobs with cost_risk alerts)
    const { data: profitRisks, error: profitError } = await supabase
      .from("job_alerts")
      .select(`
        id,
        type,
        severity,
        message,
        metadata,
        created_at,
        job_id,
        jobs:job_id (
          id,
          title,
          address,
          job_value
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("type", "cost_risk")
      .eq("is_resolved", false)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });

    // Group jobs by pipeline stage
    const jobsByStage = {
      not_scheduled: activeJobs?.filter((j) => j.status === "unscheduled") || [],
      scheduled: activeJobs?.filter((j) => j.status === "scheduled") || [],
      awaiting_materials: activeJobs?.filter((j) => {
        const deps = dependencies?.filter((d) => d.job_id === j.id && d.dependency_type === "materials");
        return deps && deps.length > 0 && deps.some((d) => d.status !== "completed");
      }) || [],
      in_progress: activeJobs?.filter((j) => j.status === "in_progress") || [],
      delayed: activeJobs?.filter((j) => {
        const alert = alerts?.find((a) => a.job_id === j.id && a.type === "delay");
        return alert !== undefined;
      }) || [],
      completed: [] as any[], // Will be fetched separately if needed
      needs_walkthrough: [] as any[], // Will be fetched separately if needed
      ready_for_billing: [] as any[], // Will be fetched separately if needed
    };

    return NextResponse.json({
      summary: summary || {},
      jobs: {
        all: activeJobs || [],
        byStage: jobsByStage,
      },
      crews: crews || [],
      events: recentEvents || [],
      alerts: alerts || [],
      dependencies: dependencies || [],
      materials: materialEvents || [],
      weather: weatherAlerts || [],
      profitabilityRisks: profitRisks || [],
      errors: {
        summary: summaryError?.message,
        jobs: jobsError?.message,
        crews: crewsError?.message,
        events: eventsError?.message,
        alerts: alertsError?.message,
        dependencies: depsError?.message,
        materials: materialsError?.message,
        weather: weatherError?.message,
        profit: profitError?.message,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/production/dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























