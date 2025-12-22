// Block 22400 — SmartSend Roofing Permit & HOA Management v1
// API Route: Get Permits and HOA for a Job
// GET /api/jobs/[jobId]/permits-hoa

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await context.params;

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
      .select(
        `
        id,
        permit_required,
        permit_status,
        permit_expiration,
        hoa_required,
        hoa_status,
        hoa_name,
        workspace_id
      `
      )
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

    // Get permits
    const { data: permits, error: permitsError } = await supabase
      .from("job_permits")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get HOA requests
    const { data: hoa, error: hoaError } = await supabase
      .from("job_hoa_requests")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (permitsError || hoaError) {
      console.error(permitsError || hoaError);
      return NextResponse.json(
        { error: (permitsError || hoaError)?.message || "Error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        job,
        permits: permits || [],
        hoa: hoa || [],
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get permits-hoa:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































