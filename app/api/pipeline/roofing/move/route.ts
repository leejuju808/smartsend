// Block 73000 — SmartSend Roofing Pipeline Move API
// POST /api/pipeline/roofing/move
// Moves a lead to a different pipeline stage

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { lead_id, stage_name } = body;

    if (!lead_id || !stage_name) {
      return NextResponse.json(
        { error: "lead_id and stage_name are required" },
        { status: 400 }
      );
    }

    // Verify lead exists and belongs to workspace
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, company_id")
      .eq("id", lead_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Move lead to stage using the database function
    const { data: stageId, error: moveError } = await supabase.rpc(
      "move_lead_to_stage",
      {
        p_lead_id: lead_id,
        p_stage_name: stage_name,
        p_workspace_id: workspaceId,
        p_company_id: lead.company_id || null,
      }
    );

    if (moveError) {
      console.error("[Roofing Pipeline Move] Error:", moveError);
      return NextResponse.json(
        { error: moveError.message || "Failed to move lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lead_id,
      stage_name,
      stage_id: stageId,
    });
  } catch (error: any) {
    console.error("[Roofing Pipeline Move] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
