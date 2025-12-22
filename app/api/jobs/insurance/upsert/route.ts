// Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
// API Route: Upsert Insurance Claim
// POST /api/jobs/insurance/upsert

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
      job_id,
      claim_id,
      carrier_name,
      claim_number,
      adjuster_name,
      adjuster_email,
      adjuster_phone,
      deductible,
      acv_amount,
      rcv_amount,
      depreciation_amount,
      acv_paid,
      rcv_paid,
      supplement_requested,
      supplement_approved,
      supplement_denied,
      claim_status,
      notes,
    } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400 }
      );
    }

    // Get job to verify access and get workspace_id
    const { data: job, error: jobError } = await supabase
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

    // Upsert insurance claim
    if (claim_id) {
      // Update existing claim
      const { error: updateError } = await supabase
        .from("job_insurance_claims")
        .update({
          carrier_name,
          claim_number,
          adjuster_name,
          adjuster_email,
          adjuster_phone,
          deductible: deductible ?? 0,
          acv_amount: acv_amount ?? 0,
          rcv_amount: rcv_amount ?? 0,
          depreciation_amount: depreciation_amount ?? 0,
          acv_paid: acv_paid ?? 0,
          rcv_paid: rcv_paid ?? 0,
          supplement_requested: supplement_requested ?? 0,
          supplement_approved: supplement_approved ?? 0,
          supplement_denied: supplement_denied ?? 0,
          claim_status: claim_status || "not_started",
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", claim_id)
        .eq("workspace_id", job.workspace_id);

      if (updateError) {
        console.error("Error updating insurance claim:", updateError);
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }
    } else {
      // Insert new claim
      const { error: insertError } = await supabase
        .from("job_insurance_claims")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          carrier_name,
          claim_number,
          adjuster_name,
          adjuster_email,
          adjuster_phone,
          deductible: deductible ?? 0,
          acv_amount: acv_amount ?? 0,
          rcv_amount: rcv_amount ?? 0,
          depreciation_amount: depreciation_amount ?? 0,
          acv_paid: acv_paid ?? 0,
          rcv_paid: rcv_paid ?? 0,
          supplement_requested: supplement_requested ?? 0,
          supplement_approved: supplement_approved ?? 0,
          supplement_denied: supplement_denied ?? 0,
          claim_status: claim_status || "not_started",
          notes,
        });

      if (insertError) {
        console.error("Error inserting insurance claim:", insertError);
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    // Sync summary (trigger will also do this, but explicit call ensures it happens)
    const { error: syncError } = await supabase.rpc("sync_insurance_summary", {
      p_job_id: job_id,
    });

    if (syncError) {
      console.error("Error syncing insurance summary:", syncError);
      // Don't fail the request, just log it
    }

    return NextResponse.json(
      { success: true },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in upsert insurance claim:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































