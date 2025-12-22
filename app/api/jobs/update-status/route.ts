// Block 22270 — SmartSend Roofing Proposal → Job Conversion Flow v1
// API Route: Update Job Status
// POST /api/jobs/update-status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { job_id, status } = body;

    if (!job_id || !status) {
      return NextResponse.json(
        { error: "Missing job_id or status" },
        { status: 400 }
      );
    }

    const validStatuses = [
      "unscheduled",
      "scheduled",
      "in_progress",
      "completed",
      "cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

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

    // Get job to verify access and get current status
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, lead_id, status")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    const oldStatus = job.status;

    // Update job status
    const { error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    if (updateError) {
      console.error("Error updating job status:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update job status" },
        { status: 500 }
      );
    }

    // Log job event
    await supabase.from("job_events").insert({
      job_id,
      workspace_id: job.workspace_id,
      lead_id: job.lead_id,
      event_type: "job_status_changed",
      metadata: { from: oldStatus, to: status },
    });

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in update job status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































