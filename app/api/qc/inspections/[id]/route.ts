// Block 50000 — SmartSend Roofing QC Inspection System v1
// API Route: QC Inspection by ID
// GET /api/qc/inspections/[id]
// PATCH /api/qc/inspections/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get single QC inspection by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    
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

    const { data: inspection, error } = await supabase
      .from("qc_inspections")
      .select(`
        *,
        job:roofing_jobs(id, title, status, job_value, lead_id),
        supervisor:crew_members(id, name, email),
        photos:qc_photos(*),
        failures:qc_failures(
          *,
          punch_task:punch_list(*)
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching QC inspection:", error);
      return NextResponse.json(
        { error: "Failed to fetch QC inspection" },
        { status: 500 }
      );
    }

    if (!inspection) {
      return NextResponse.json(
        { error: "QC inspection not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      inspection,
    });
  } catch (error: any) {
    console.error("Error in get QC inspection API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update QC inspection (submit checklist, update status, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    
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
      checklist,
      status,
      supervisor_id,
      supervisor_notes,
      overall_notes,
      photos_uploaded_count,
      pass_threshold,
    } = body;

    const updateData: any = {};

    if (checklist !== undefined) updateData.checklist = checklist;
    if (status !== undefined) updateData.status = status;
    if (supervisor_id !== undefined) updateData.supervisor_id = supervisor_id;
    if (supervisor_notes !== undefined) updateData.supervisor_notes = supervisor_notes;
    if (overall_notes !== undefined) updateData.overall_notes = overall_notes;
    if (photos_uploaded_count !== undefined) updateData.photos_uploaded_count = photos_uploaded_count;
    if (pass_threshold !== undefined) updateData.pass_threshold = pass_threshold;

    // Set completed_at if status is completed
    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: inspection, error } = await supabase
      .from("qc_inspections")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating QC inspection:", error);
      return NextResponse.json(
        { error: "Failed to update QC inspection" },
        { status: 500 }
      );
    }

    // If status is failed, trigger punch task creation (via database trigger, but we can also check here)
    if (status === "failed" && checklist) {
      // The database trigger should handle this, but we can also manually trigger
      await supabase.rpc("create_punch_tasks_from_qc_failures", {
        p_qc_inspection_id: id,
      });
    }

    return NextResponse.json({
      success: true,
      inspection,
    });
  } catch (error: any) {
    console.error("Error in update QC inspection API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































