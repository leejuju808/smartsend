// Block 16300 — SmartSend Pipeline v2 Move API
// POST /api/pipeline/move
// Moves a contact to a new pipeline stage (drag & drop or auto-move)

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
    const { contact_id, to_stage_key, trigger_type, trigger_data } = body;

    if (!contact_id || !to_stage_key) {
      return NextResponse.json(
        { error: "contact_id and to_stage_key are required" },
        { status: 400 }
      );
    }

    // Validate stage key (Pipeline v2 stages)
    const validStages = [
      "new_leads",
      "warm_leads",
      "hot_leads",
      "appointment_booked",
      "inspection_completed",
      "insurance_opportunity",
      "quote_sent",
      "requote_revival",
      "not_interested",
    ];
    
    if (!validStages.includes(to_stage_key)) {
      return NextResponse.json(
        { error: `Invalid stage. Must be one of: ${validStages.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify contact belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, email, pipeline_stage_key, workspace_id")
      .eq("id", contact_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Get pipeline_stage_id for the new stage
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("key", to_stage_key)
      .single();

    if (!stage) {
      return NextResponse.json(
        { error: "Pipeline stage not found" },
        { status: 404 }
      );
    }

    // If trigger_type is provided, use auto-move function
    if (trigger_type) {
      const { data: newStageKey, error: autoMoveError } = await supabase.rpc(
        "auto_move_pipeline_stage",
        {
          p_contact_id: contact_id,
          p_trigger_type: trigger_type,
          p_trigger_data: trigger_data || '{}'::jsonb,
        }
      );

      if (autoMoveError) {
        console.error("[Pipeline Move] Auto-move error:", autoMoveError);
        return NextResponse.json(
          { error: "Failed to auto-move contact" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        contact_id,
        from_stage: contact.pipeline_stage_key,
        to_stage: newStageKey,
        auto_moved: true,
      });
    }

    // Manual move (drag & drop)
    const { error: updateError } = await supabase
      .from("contacts")
      .update({
        pipeline_stage_key: to_stage_key,
        pipeline_stage_id: stage.id,
        moved_to_stage_at: new Date().toISOString(),
        auto_move_reason: "manual_drag",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact_id);

    if (updateError) {
      console.error("[Pipeline Move] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to move contact" },
        { status: 500 }
      );
    }

    // Recalculate heat score after move
    await supabase.rpc("calculate_lead_heat_score", {
      p_contact_id: contact_id,
    });

    return NextResponse.json({
      ok: true,
      contact_id,
      from_stage: contact.pipeline_stage_key,
      to_stage: to_stage_key,
      auto_moved: false,
    });
  } catch (error: any) {
    console.error("[Pipeline Move] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

