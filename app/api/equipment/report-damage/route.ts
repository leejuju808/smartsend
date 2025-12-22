// Block 70000 — SmartSend Roofing Equipment Tracking + Fleet Maintenance System v1
// API Route: Report Equipment Damage
// POST /api/equipment/report-damage

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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
      equipment_id,
      crew_member_id,
      job_id,
      issue_description,
      severity,
      photos,
      cost_estimate,
      repair_vendor,
      estimated_downtime_days,
    } = body;

    if (!equipment_id || !issue_description) {
      return NextResponse.json(
        { error: "equipment_id and issue_description are required" },
        { status: 400 }
      );
    }

    // Verify equipment exists
    const { data: equipment, error: equipmentError } = await supabase
      .from("equipment")
      .select("id, workspace_id, condition")
      .eq("id", equipment_id)
      .single();

    if (equipmentError || !equipment) {
      return NextResponse.json(
        { error: "Equipment not found" },
        { status: 404 }
      );
    }

    // Create repair ticket
    const { data: repairTicket, error: ticketError } = await supabase
      .from("equipment_repair_tickets")
      .insert({
        equipment_id,
        workspace_id: equipment.workspace_id,
        crew_member_id: crew_member_id || null,
        job_id: job_id || null,
        issue_description,
        severity: severity || "moderate",
        reported_condition: equipment.condition,
        photos: photos || [],
        cost_estimate: cost_estimate || null,
        repair_vendor: repair_vendor || null,
        estimated_downtime_days: estimated_downtime_days || null,
        reported_by: user.id,
        status: "pending",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating repair ticket:", ticketError);
      return NextResponse.json(
        { error: ticketError.message },
        { status: 500 }
      );
    }

    // Update equipment condition
    await supabase
      .from("equipment")
      .update({
        condition: severity === "critical" ? "damaged" : "minor_issues",
        status: "in_repair",
        updated_at: new Date().toISOString(),
      })
      .eq("id", equipment_id);

    // Log the damage report
    await supabase.from("equipment_logs").insert({
      equipment_id,
      workspace_id: equipment.workspace_id,
      crew_member_id: crew_member_id || null,
      job_id: job_id || null,
      action: "damage_report",
      notes: issue_description,
      condition_before: equipment.condition,
      condition_after: severity === "critical" ? "damaged" : "minor_issues",
      photos: photos || [],
    });

    return NextResponse.json({
      success: true,
      repair_ticket: repairTicket,
      message: "Damage reported successfully",
    });
  } catch (error: any) {
    console.error("Error in report damage API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























