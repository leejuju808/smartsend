// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/job-status/update
// Update job status (for office/crew use, auto-updates customer portal)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { job_id, status, stage, progress, notes } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get current job
    const { data: currentJob } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (!currentJob) {
      // Try jobs table
      const { data: altJob } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      if (!altJob) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Update job
    const updates: any = {};
    if (status) updates.status = status;
    if (stage) updates.stage = stage;
    if (progress !== undefined) updates.progress = progress;
    if (notes) updates.notes = notes;
    updates.updated_at = new Date().toISOString();

    // Try roofing_jobs first
    let updatedJob = null;
    const { data: roofingJob, error: roofingError } = await supabase
      .from("roofing_jobs")
      .update(updates)
      .eq("id", job_id)
      .select()
      .single();

    if (roofingJob) {
      updatedJob = roofingJob;
    } else {
      // Try jobs table
      const { data: jobAlt, error: jobError } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", job_id)
        .select()
        .single();

      if (jobError || !jobAlt) {
        return NextResponse.json(
          { error: "Failed to update job" },
          { status: 500 }
        );
      }
      updatedJob = jobAlt;
    }

    // Get homeowner to create notification
    const { data: portalAccess } = await supabase
      .from("customer_portal_access")
      .select("homeowner_id")
      .eq("job_id", job_id)
      .eq("is_active", true)
      .limit(1);

    if (portalAccess && portalAccess.length > 0) {
      const homeownerId = portalAccess[0].homeowner_id;

      // Create status update notification
      let title = "Job Status Updated";
      let body = `Your job status has been updated to: ${status || stage || "updated"}`;

      if (status === "in_progress" || stage === "in_progress") {
        title = "Work Started";
        body = "Work has started on your roof!";
      } else if (status === "completed" || stage === "completed") {
        title = "Job Completed";
        body = "Your roofing project has been completed!";
      }

      await supabase.from("customer_notifications").insert({
        homeowner_id: homeownerId,
        job_id,
        event_type: "photos_uploaded", // Reuse event type
        title,
        body,
        read: false,
        metadata: {
          type: "status_update",
          status: status || stage,
          progress,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      job: updatedJob,
    });
  } catch (error: any) {
    console.error("Error in job status update API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























