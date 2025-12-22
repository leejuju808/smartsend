// Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
// API Route: Crew Readiness Checklist
// GET/PATCH /api/jobs/[jobId]/readiness-checklist

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Get readiness checklist
    const { data: checklist, error: checklistError } = await supabase
      .from("crew_readiness_checklists")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (checklistError && checklistError.code !== "PGRST116") {
      console.error("Error fetching checklist:", checklistError);
      return NextResponse.json(
        { error: checklistError.message || "Failed to fetch checklist" },
        { status: 500 }
      );
    }

    // If no checklist exists, create one
    if (!checklist) {
      // Get job workspace_id
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", jobId)
        .single();

      if (!job) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      const { data: newChecklist, error: createError } = await supabase
        .from("crew_readiness_checklists")
        .insert({
          job_id: jobId,
          workspace_id: job.workspace_id,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating checklist:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create checklist" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { checklist: newChecklist },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { checklist },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in readiness checklist:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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
      shingle_color_verified,
      underlayment_confirmed,
      ridge_cap_included,
      drip_edge_included,
      flashing_confirmed,
      dumpster_scheduled,
      trailer_scheduled,
      weather_checked,
      address_verified,
      job_notes_reviewed,
      plywood_needs_prepared,
      homeowner_notified,
      custom_items,
    } = body;

    // Build update object
    const updates: any = {};
    if (shingle_color_verified !== undefined) updates.shingle_color_verified = shingle_color_verified;
    if (underlayment_confirmed !== undefined) updates.underlayment_confirmed = underlayment_confirmed;
    if (ridge_cap_included !== undefined) updates.ridge_cap_included = ridge_cap_included;
    if (drip_edge_included !== undefined) updates.drip_edge_included = drip_edge_included;
    if (flashing_confirmed !== undefined) updates.flashing_confirmed = flashing_confirmed;
    if (dumpster_scheduled !== undefined) updates.dumpster_scheduled = dumpster_scheduled;
    if (trailer_scheduled !== undefined) updates.trailer_scheduled = trailer_scheduled;
    if (weather_checked !== undefined) updates.weather_checked = weather_checked;
    if (address_verified !== undefined) updates.address_verified = address_verified;
    if (job_notes_reviewed !== undefined) updates.job_notes_reviewed = job_notes_reviewed;
    if (plywood_needs_prepared !== undefined) updates.plywood_needs_prepared = plywood_needs_prepared;
    if (homeowner_notified !== undefined) updates.homeowner_notified = homeowner_notified;
    if (custom_items !== undefined) updates.custom_items = custom_items;

    // Check if all items are complete
    const { data: currentChecklist } = await supabase
      .from("crew_readiness_checklists")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (currentChecklist) {
      const allComplete =
        (updates.shingle_color_verified ?? currentChecklist.shingle_color_verified) &&
        (updates.underlayment_confirmed ?? currentChecklist.underlayment_confirmed) &&
        (updates.ridge_cap_included ?? currentChecklist.ridge_cap_included) &&
        (updates.drip_edge_included ?? currentChecklist.drip_edge_included) &&
        (updates.flashing_confirmed ?? currentChecklist.flashing_confirmed) &&
        (updates.dumpster_scheduled ?? currentChecklist.dumpster_scheduled) &&
        (updates.trailer_scheduled ?? currentChecklist.trailer_scheduled) &&
        (updates.weather_checked ?? currentChecklist.weather_checked) &&
        (updates.address_verified ?? currentChecklist.address_verified) &&
        (updates.job_notes_reviewed ?? currentChecklist.job_notes_reviewed) &&
        (updates.plywood_needs_prepared ?? currentChecklist.plywood_needs_prepared) &&
        (updates.homeowner_notified ?? currentChecklist.homeowner_notified);

      if (allComplete && !currentChecklist.completed_at) {
        updates.completed_at = new Date().toISOString();
        updates.completed_by = user.id;
      }
    }

    // Update checklist
    const { data: updatedChecklist, error: updateError } = await supabase
      .from("crew_readiness_checklists")
      .update(updates)
      .eq("job_id", jobId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating checklist:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to update checklist" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { checklist: updatedChecklist },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error updating readiness checklist:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































