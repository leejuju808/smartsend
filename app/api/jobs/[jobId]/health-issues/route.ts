// Block 24420 — SmartSend Roofing Job Health Score v2
// API Route: Get Job Health Issues
// GET /api/jobs/[jobId]/health-issues

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job and verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get active health issues (Top 3 Issues To Fix Right Now)
    const { data: issues, error: issuesError } = await supabase
      .from("job_health_issues")
      .select("*")
      .eq("job_id", jobId)
      .eq("status", "active")
      .order("urgency", { ascending: false })
      .order("score_impact", { ascending: false })
      .limit(3);

    if (issuesError) {
      console.error("Error fetching health issues:", issuesError);
      return NextResponse.json(
        { error: "Failed to fetch health issues" },
        { status: 500 }
      );
    }

    return NextResponse.json({ issues: issues || [] });
  } catch (error: any) {
    console.error("Error in health-issues API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

