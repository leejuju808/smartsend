// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Crew Penalties
// POST /api/crew/penalties

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const body = await req.json();
    const {
      crew_pay_entry_id,
      job_id,
      crew_id,
      penalty_type,
      penalty_amount,
      penalty_reason,
      callback_id,
      callback_cost,
      missing_photos_count,
      poor_quality_photos_count,
      cleanup_failed,
      cleanup_notes,
      notes,
    } = body;

    if (!job_id || !crew_id || !penalty_type || !penalty_amount || !penalty_reason) {
      return NextResponse.json(
        { error: "job_id, crew_id, penalty_type, penalty_amount, and penalty_reason are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access and is admin/owner
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Access denied. Admin or owner role required." },
        { status: 403 }
      );
    }

    // Get or create pay entry if needed
    let payEntryId = crew_pay_entry_id;
    if (!payEntryId) {
      const { data: existingPayEntry } = await supabase
        .from("crew_pay_entries")
        .select("id")
        .eq("job_id", job_id)
        .eq("crew_id", crew_id)
        .single();

      if (existingPayEntry) {
        payEntryId = existingPayEntry.id;
      }
    }

    // Create penalty
    const penaltyData: any = {
      job_id,
      crew_id,
      workspace_id: job.workspace_id,
      penalty_type,
      penalty_amount,
      penalty_reason,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    if (payEntryId) penaltyData.crew_pay_entry_id = payEntryId;
    if (callback_id !== undefined) penaltyData.callback_id = callback_id;
    if (callback_cost !== undefined) penaltyData.callback_cost = callback_cost;
    if (missing_photos_count !== undefined) penaltyData.missing_photos_count = missing_photos_count;
    if (poor_quality_photos_count !== undefined) penaltyData.poor_quality_photos_count = poor_quality_photos_count;
    if (cleanup_failed !== undefined) penaltyData.cleanup_failed = cleanup_failed;
    if (cleanup_notes !== undefined) penaltyData.cleanup_notes = cleanup_notes;
    if (notes !== undefined) penaltyData.notes = notes;

    const { data: penalty, error: penaltyError } = await supabase
      .from("crew_penalties")
      .insert(penaltyData)
      .select()
      .single();

    if (penaltyError) {
      console.error("Error creating penalty:", penaltyError);
      return NextResponse.json(
        { error: penaltyError.message || "Failed to create penalty" },
        { status: 500 }
      );
    }

    // Recalculate pay entry if it exists
    if (payEntryId) {
      await supabase.rpc("calculate_crew_pay_entry", {
        p_job_id: job_id,
        p_crew_id: crew_id,
      });
    }

    return NextResponse.json(
      { penalty },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in crew penalties API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































