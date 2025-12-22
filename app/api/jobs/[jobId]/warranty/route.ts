// Block 22360 — SmartSend Roofing Warranty & Service Tracking v1
// API Route: Get Job Warranty Details
// GET /api/jobs/[jobId]/warranty

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
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
        title,
        workmanship_warranty_expiration,
        material_warranty_expiration,
        has_active_warranty,
        workspace_id
      `
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Not found" },
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

    // Get warranties
    const { data: warranties, error: wError } = await supabase
      .from("job_warranties")
      .select("*")
      .eq("job_id", jobId)
      .order("start_date", { ascending: true });

    // Get service calls
    const { data: calls, error: cError } = await supabase
      .from("job_service_calls")
      .select("*")
      .eq("job_id", jobId)
      .order("requested_at", { ascending: false });

    if (wError || cError) {
      console.error(wError || cError);
      return NextResponse.json(
        { error: (wError || cError)?.message || "Error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        job,
        warranties: warranties || [],
        calls: calls || [],
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get warranty:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































