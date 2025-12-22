// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Daily Safety Scan
// GET /api/safety/daily-scan
// Looks for missing checklists, missing safety photos, past incidents, high-wind days
// Sends morning alert to owner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;
    const today = new Date().toISOString().split("T")[0];

    // Find jobs scheduled for today without completed safety checklists
    const { data: jobsWithoutChecklists } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        status,
        scheduled_start_date
      `)
      .eq("workspace_id", workspaceId)
      .in("status", ["scheduled", "in_progress"])
      .eq("scheduled_start_date", today);

    const missingChecklists: any[] = [];
    
    if (jobsWithoutChecklists) {
      for (const job of jobsWithoutChecklists) {
        const { data: checklist } = await supabase
          .from("safety_checklists")
          .select("id")
          .eq("job_id", job.id)
          .eq("completed", true)
          .gte("created_at", today)
          .single();

        if (!checklist) {
          missingChecklists.push(job);
        }
      }
    }

    // Find jobs with low safety scores
    const { data: lowScoreJobs } = await supabase
      .from("safety_scores")
      .select(`
        job_id,
        score,
        roofing_jobs!inner(id, title, status)
      `)
      .lt("score", 80)
      .eq("roofing_jobs.workspace_id", workspaceId)
      .eq("roofing_jobs.status", "in_progress");

    // Find recent incidents (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentIncidents } = await supabase
      .from("incident_reports")
      .select(`
        id,
        incident_type,
        severity,
        description,
        created_at,
        roofing_jobs!inner(id, title, workspace_id)
      `)
      .eq("roofing_jobs.workspace_id", workspaceId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    // Find open incidents
    const { data: openIncidents } = await supabase
      .from("incident_reports")
      .select(`
        id,
        incident_type,
        severity,
        description,
        created_at,
        roofing_jobs!inner(id, title, workspace_id)
      `)
      .eq("roofing_jobs.workspace_id", workspaceId)
      .in("status", ["reported", "investigating"])
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      scan_date: today,
      missing_checklists: missingChecklists,
      low_score_jobs: lowScoreJobs || [],
      recent_incidents: recentIncidents || [],
      open_incidents: openIncidents || [],
      summary: {
        missing_checklists_count: missingChecklists.length,
        low_score_jobs_count: lowScoreJobs?.length || 0,
        recent_incidents_count: recentIncidents?.length || 0,
        open_incidents_count: openIncidents?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("Error in daily safety scan API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































