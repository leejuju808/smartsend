// Block 16300 — SmartSend Pipeline v2 Update API
// POST /api/pipeline/update
// Updates pipeline-related fields for a contact (quote, appointment, inspection, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contact_id, updates } = body;

    if (!contact_id || !updates) {
      return NextResponse.json(
        { error: "contact_id and updates are required" },
        { status: 400 }
      );
    }

    // Verify contact belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contact_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Handle quote updates
    if (updates.quote_amount !== undefined) {
      updateData.quote_amount = updates.quote_amount;
    }
    if (updates.quote_sent_at !== undefined) {
      updateData.quote_sent_at = updates.quote_sent_at;
      // Auto-move to quote_sent stage
      updateData.pipeline_stage_key = "quote_sent";
    }
    if (updates.quote_pdf_url !== undefined) {
      updateData.quote_pdf_url = updates.quote_pdf_url;
    }
    if (updates.is_requote !== undefined) {
      updateData.is_requote = updates.is_requote;
      if (updates.is_requote) {
        updateData.pipeline_stage_key = "requote_revival";
      }
    }

    // Handle appointment updates
    if (updates.next_appointment_at !== undefined) {
      updateData.next_appointment_at = updates.next_appointment_at;
      // Auto-move to appointment_booked stage
      if (updates.next_appointment_at) {
        updateData.pipeline_stage_key = "appointment_booked";
      }
    }
    if (updates.last_appointment_at !== undefined) {
      updateData.last_appointment_at = updates.last_appointment_at;
    }
    if (updates.total_appointments !== undefined) {
      updateData.total_appointments = updates.total_appointments;
    }

    // Handle inspection updates
    if (updates.inspection_completed_at !== undefined) {
      updateData.inspection_completed_at = updates.inspection_completed_at;
      updateData.inspection_notes = updates.inspection_notes || null;
      // Auto-move to inspection_completed stage
      if (updates.inspection_completed_at) {
        updateData.pipeline_stage_key = "inspection_completed";
      }
    }
    if (updates.inspection_notes !== undefined && updates.inspection_completed_at === undefined) {
      updateData.inspection_notes = updates.inspection_notes;
    }

    // Handle follow-up updates
    if (updates.follow_up_reminder_date !== undefined) {
      updateData.follow_up_reminder_date = updates.follow_up_reminder_date;
    }
    if (updates.last_follow_up_at !== undefined) {
      updateData.last_follow_up_at = updates.last_follow_up_at;
    }

    // Handle manual stage change
    if (updates.pipeline_stage_key !== undefined) {
      // Get pipeline_stage_id
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("key", updates.pipeline_stage_key)
        .single();

      if (stage) {
        updateData.pipeline_stage_key = updates.pipeline_stage_key;
        updateData.pipeline_stage_id = stage.id;
        updateData.moved_to_stage_at = new Date().toISOString();
      }
    }

    // Update contact
    const { error: updateError } = await supabase
      .from("contacts")
      .update(updateData)
      .eq("id", contact_id);

    if (updateError) {
      console.error("[Pipeline Update] Error:", updateError);
      return NextResponse.json(
        { error: "Failed to update contact" },
        { status: 500 }
      );
    }

    // Recalculate heat score
    await supabase.rpc("calculate_lead_heat_score", {
      p_contact_id: contact_id,
    });

    return NextResponse.json({
      ok: true,
      contact_id,
      updates: updateData,
    });
  } catch (error: any) {
    console.error("[Pipeline Update] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
