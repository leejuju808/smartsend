// Block 24420 — SmartSend Roofing Job Health Score v2
// API Route: Get Job Health Score
// GET /api/jobs/[jobId]/health-score

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

    // Get health score
    const { data: healthScore, error: healthError } = await supabase
      .from("job_health_scores")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (healthError && healthError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is OK - we'll calculate it
      console.error("Error fetching health score:", healthError);
    }

    // If no health score exists, calculate it
    if (!healthScore) {
      const { data: scoreId, error: calcError } = await supabase.rpc(
        "calculate_job_health_score",
        { p_job_id: jobId }
      );

      if (calcError) {
        console.error("Error calculating health score:", calcError);
        return NextResponse.json(
          { error: "Failed to calculate health score" },
          { status: 500 }
        );
      }

      // Fetch the newly calculated score
      const { data: newHealthScore, error: fetchError } = await supabase
        .from("job_health_scores")
        .select("*")
        .eq("id", scoreId)
        .single();

      if (fetchError) {
        return NextResponse.json(
          { error: "Failed to fetch calculated health score" },
          { status: 500 }
        );
      }

      return NextResponse.json({ healthScore: newHealthScore });
    }

    return NextResponse.json({ healthScore });
  } catch (error: any) {
    console.error("Error in health-score API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST endpoint to recalculate health score
export async function POST(
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

    // Recalculate health score
    const { data: scoreId, error: calcError } = await supabase.rpc(
      "calculate_job_health_score",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating health score:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate health score" },
        { status: 500 }
      );
    }

    // Fetch the recalculated score
    const { data: healthScore, error: fetchError } = await supabase
      .from("job_health_scores")
      .select("*")
      .eq("id", scoreId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch calculated health score" },
        { status: 500 }
      );
    }

    return NextResponse.json({ healthScore });
  } catch (error: any) {
    console.error("Error in health-score recalculation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































