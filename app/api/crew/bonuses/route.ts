// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Crew Bonuses
// POST /api/crew/bonuses

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
      bonus_type,
      bonus_amount,
      bonus_reason,
      photo_compliance_score,
      cleanup_score,
      target_hours,
      actual_hours,
      homeowner_rating,
      review_text,
      notes,
    } = body;

    if (!job_id || !crew_id || !bonus_type || !bonus_amount || !bonus_reason) {
      return NextResponse.json(
        { error: "job_id, crew_id, bonus_type, bonus_amount, and bonus_reason are required" },
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

    // Create bonus
    const bonusData: any = {
      job_id,
      crew_id,
      workspace_id: job.workspace_id,
      bonus_type,
      bonus_amount,
      bonus_reason,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    if (payEntryId) bonusData.crew_pay_entry_id = payEntryId;
    if (photo_compliance_score !== undefined) bonusData.photo_compliance_score = photo_compliance_score;
    if (cleanup_score !== undefined) bonusData.cleanup_score = cleanup_score;
    if (target_hours !== undefined) bonusData.target_hours = target_hours;
    if (actual_hours !== undefined) bonusData.actual_hours = actual_hours;
    if (homeowner_rating !== undefined) bonusData.homeowner_rating = homeowner_rating;
    if (review_text !== undefined) bonusData.review_text = review_text;
    if (notes !== undefined) bonusData.notes = notes;

    const { data: bonus, error: bonusError } = await supabase
      .from("crew_bonuses")
      .insert(bonusData)
      .select()
      .single();

    if (bonusError) {
      console.error("Error creating bonus:", bonusError);
      return NextResponse.json(
        { error: bonusError.message || "Failed to create bonus" },
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
      { bonus },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in crew bonuses API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































