// Block 27010 — SmartSend Roofing Supplement Builder v1
// API Route: Build Supplement from Photos & Inspection
// POST /api/job/[job_id]/build-supplement

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
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

    // Call edge function to build supplement
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(`${supabaseUrl}/functions/v1/build_supplement`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({ job_id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: errorData.error || "Failed to build supplement" },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      status: "success",
      supplement_id: data.supplement_id,
      summary: data.summary,
      line_items: data.line_items,
    });
  } catch (error: any) {
    console.error("Error building supplement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































