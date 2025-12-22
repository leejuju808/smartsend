// Block 25620 — SmartSend Roofing Alerts Intelligence v1
// API Route: Run Background Monitoring Functions
// POST /api/alerts/monitor

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { monitoring_type, workspace_id } = body;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace if not provided
    let targetWorkspaceId = workspace_id;
    if (!targetWorkspaceId) {
      const { data: workspace, error: workspaceError } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 404 }
        );
      }

      targetWorkspaceId = workspace.workspace_id;
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", targetWorkspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let alertsCreated = 0;
    let error: any = null;

    // Run appropriate monitoring function
    switch (monitoring_type) {
      case "leads":
        const { data: leadsResult, error: leadsError } = await supabase.rpc(
          "monitor_lead_contact_times",
          {
            p_workspace_id: targetWorkspaceId,
          }
        );
        alertsCreated = leadsResult || 0;
        error = leadsError;
        break;

      case "jobs":
        const { data: jobsResult, error: jobsError } = await supabase.rpc(
          "monitor_job_risks",
          {
            p_workspace_id: targetWorkspaceId,
          }
        );
        alertsCreated = jobsResult || 0;
        error = jobsError;
        break;

      case "crews":
        const { data: crewsResult, error: crewsError } = await supabase.rpc(
          "monitor_crew_check_ins",
          {
            p_workspace_id: targetWorkspaceId,
          }
        );
        alertsCreated = crewsResult || 0;
        error = crewsError;
        break;

      case "all":
        // Run all monitoring functions
        const [
          { data: leadsData },
          { data: jobsData },
          { data: crewsData },
        ] = await Promise.all([
          supabase.rpc("monitor_lead_contact_times", {
            p_workspace_id: targetWorkspaceId,
          }),
          supabase.rpc("monitor_job_risks", {
            p_workspace_id: targetWorkspaceId,
          }),
          supabase.rpc("monitor_crew_check_ins", {
            p_workspace_id: targetWorkspaceId,
          }),
        ]);

        alertsCreated =
          (leadsData || 0) + (jobsData || 0) + (crewsData || 0);
        break;

      default:
        return NextResponse.json(
          {
            error: "Invalid monitoring_type",
            valid_types: ["leads", "jobs", "crews", "all"],
          },
          { status: 400 }
        );
    }

    if (error) {
      console.error("Error running monitoring:", error);
      return NextResponse.json(
        { error: "Failed to run monitoring", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      monitoring_type,
      alerts_created: alertsCreated,
    });
  } catch (error: any) {
    console.error("Error in POST /api/alerts/monitor:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}




































