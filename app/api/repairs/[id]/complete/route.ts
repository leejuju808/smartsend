// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/complete
// Complete repair job and create warranty

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      work_performed,
      findings,
      materials_used,
      actual_duration_minutes,
      customer_satisfaction_score,
      customer_feedback,
      warranty_length_days = 90,
      warranty_type = "standard",
      covered_items,
    } = body;

    // Get repair job
    const { data: repairJob, error: jobError } = await supabase
      .from("repair_jobs")
      .select("*, repair_requests(*)")
      .eq("id", id)
      .single();

    if (jobError || !repairJob) {
      return NextResponse.json(
        { error: "Repair job not found" },
        { status: 404 }
      );
    }

    // Verify job is in progress or scheduled
    if (!["scheduled", "en_route", "on_site", "in_progress"].includes(repairJob.status)) {
      return NextResponse.json(
        { error: `Cannot complete job with status: ${repairJob.status}` },
        { status: 400 }
      );
    }

    // Verify required photos are uploaded
    const hasBeforePhotos = repairJob.photos_before && repairJob.photos_before.length > 0;
    const hasAfterPhotos = repairJob.photos_after && repairJob.photos_after.length > 0;

    if (!hasBeforePhotos || !hasAfterPhotos) {
      return NextResponse.json(
        {
          error: "Missing required photos",
          missing: {
            before: !hasBeforePhotos,
            after: !hasAfterPhotos,
          },
        },
        { status: 400 }
      );
    }

    // Update repair job
    const { data: updatedJob, error: updateError } = await supabase
      .from("repair_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        work_performed: work_performed || null,
        findings: findings || null,
        materials_used: materials_used || null,
        actual_duration_minutes: actual_duration_minutes || null,
        customer_satisfaction_score: customer_satisfaction_score || null,
        customer_feedback: customer_feedback || null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update repair job", details: updateError.message },
        { status: 500 }
      );
    }

    // Create warranty
    const repairRequest = repairJob.repair_requests;
    const { data: warranty, error: warrantyError } = await supabase
      .from("repair_warranties")
      .insert({
        repair_job_id: id,
        repair_request_id: repairRequest.id,
        team_id: repairJob.team_id,
        customer_id: repairRequest.customer_id,
        warranty_length_days,
        warranty_type,
        covered_items: covered_items || [repairRequest.ai_predicted_repair_type || "repair_work"],
        coverage_description: `Warranty covers ${covered_items?.join(", ") || "repair work"} for ${warranty_length_days} days`,
        is_active: true,
      })
      .select("*")
      .single();

    if (warrantyError) {
      console.error("Error creating warranty:", warrantyError);
      // Don't fail the completion if warranty creation fails
    }

    // Update customer's warranty count if customer exists
    if (repairRequest.customer_id) {
      await supabase.rpc("increment_customer_warranty_count", {
        p_customer_id: repairRequest.customer_id,
      }).catch(() => {
        // Ignore if function doesn't exist
      });
    }

    return NextResponse.json({
      success: true,
      repair_job: updatedJob,
      warranty: warranty || null,
      message: "Repair job completed and warranty created",
    });
  } catch (error: any) {
    console.error("Error in complete repair API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















