// Block 22360 — SmartSend Roofing Warranty & Service Tracking v1
// API Route: Create Service Call
// POST /api/jobs/service-call

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();

    const { job_id, issue_type, description, scheduled_date } = body;

    if (!job_id || !issue_type) {
      return NextResponse.json(
        { error: "Missing job_id or issue_type" },
        { status: 400 }
      );
    }

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
        "id, workspace_id, workmanship_warranty_expiration, material_warranty_expiration"
      )
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const underWork =
      job.workmanship_warranty_expiration &&
      job.workmanship_warranty_expiration >= today;

    const underMat =
      job.material_warranty_expiration &&
      job.material_warranty_expiration >= today;

    const underWarrantyAtTime = !!(underWork || underMat);

    const { error: insertError } = await supabase
      .from("job_service_calls")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        issue_type,
        description: description || null,
        scheduled_date: scheduled_date || null,
        is_warranty: true,
        under_warranty_at_time: underWarrantyAtTime,
        created_by: user.id,
      });

    if (insertError) {
      console.error(insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in service-call:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































