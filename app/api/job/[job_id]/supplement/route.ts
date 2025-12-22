// Block 27010 — SmartSend Roofing Supplement Builder v1
// API Route: Get Supplement Data
// GET /api/job/[job_id]/supplement

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

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

    // Get job details to verify access and get workspace_id
    const { data: job, error: jobError } = await serviceSupabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
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
      // Check if user is workspace owner
      const { data: workspace } = await serviceSupabase
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", job.workspace_id)
        .single();

      if (!workspace || workspace.owner_id !== user.id) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Fetch supplement
    const { data: supplement } = await serviceSupabase
      .from("roofing_supplements")
      .select("*")
      .eq("job_id", job_id)
      .single();

    let line_items: any[] = [];
    if (supplement) {
      const { data } = await serviceSupabase
        .from("roofing_supplement_line_items")
        .select("*")
        .eq("supplement_id", supplement.id)
        .order("created_at", { ascending: true });
      line_items = data || [];
    }

    return NextResponse.json({ supplement, line_items });
  } catch (error: any) {
    console.error("Error fetching supplement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































