// Block 25980 — Production Calendar Reschedule API
// POST /api/production-calendar/reschedule - Reschedule a production slot

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      slot_id,
      new_start_date,
      new_end_date,
      new_crew_id,
      reschedule_reason,
      reschedule_type = "manual",
      notify_homeowner = true,
      notify_crew = true,
      notify_supplier = true,
    } = body;

    if (!slot_id || !new_start_date) {
      return NextResponse.json(
        { error: "slot_id and new_start_date are required" },
        { status: 400 }
      );
    }

    // Get current slot
    const { data: currentSlot, error: slotError } = await supabase
      .from("job_production_slots")
      .select("*")
      .eq("id", slot_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (slotError || !currentSlot) {
      return NextResponse.json(
        { error: "Production slot not found" },
        { status: 404 }
      );
    }

    // Update slot (trigger will log the reschedule)
    const { data: updatedSlot, error: updateError } = await supabase
      .from("job_production_slots")
      .update({
        start_date: new_start_date,
        end_date: new_end_date || new_start_date,
        crew_id: new_crew_id || currentSlot.crew_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error rescheduling slot:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    // Re-detect conflicts
    await supabase.rpc("detect_production_slot_conflicts", {
      p_slot_id: slot_id,
    });

    // Update reschedule log with notification flags
    const { error: logError } = await supabase
      .from("production_calendar_reschedule_log")
      .update({
        homeowner_notified: notify_homeowner,
        crew_notified: notify_crew,
        supplier_notified: notify_supplier,
        reschedule_reason,
        reschedule_type,
      })
      .eq("production_slot_id", slot_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (logError) {
      console.error("Error updating reschedule log:", logError);
    }

    // TODO: Trigger homeowner notification if requested
    // TODO: Trigger crew notification if requested
    // TODO: Trigger supplier notification if requested

    return NextResponse.json({
      success: true,
      slot: updatedSlot,
      message: "Production slot rescheduled successfully",
    });
  } catch (error: any) {
    console.error("Error in reschedule API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































