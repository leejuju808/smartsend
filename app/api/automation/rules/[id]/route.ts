// Block 75000 — Automation Rules API
// GET /api/automation/rules/[id] - Get a single automation rule
// PATCH /api/automation/rules/[id] - Update an automation rule
// DELETE /api/automation/rules/[id] - Delete an automation rule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Get the rule
    const { data: rule, error: ruleError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (ruleError || !rule) {
      return NextResponse.json(
        { error: "Automation rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error("[Automation Rules] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();

    // Validate trigger_type if provided
    if (body.trigger_type) {
      const validTriggerTypes = [
        "lead_reply",
        "new_lead",
        "estimate_uploaded",
        "estimate_sent",
        "pipeline_stage_changed",
        "job_created",
        "job_completed",
        "safety_flag",
      ];
      if (!validTriggerTypes.includes(body.trigger_type)) {
        return NextResponse.json(
          { error: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Validate action_type if provided
    if (body.action_type) {
      const validActionTypes = [
        "send_email",
        "send_sms",
        "move_pipeline_stage",
        "create_followup",
        "assign_team_member",
        "create_job",
        "send_owner_alert",
        "update_job_status",
      ];
      if (!validActionTypes.includes(body.action_type)) {
        return NextResponse.json(
          { error: `Invalid action_type. Must be one of: ${validActionTypes.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Update the rule
    const { data: rule, error: updateError } = await supabase
      .from("automation_rules")
      .update(body)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (updateError || !rule) {
      return NextResponse.json(
        { error: "Failed to update automation rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error("[Automation Rules] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    // Delete the rule
    const { error: deleteError } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId);

    if (deleteError) {
      console.error("[Automation Rules] Delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete automation rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Automation Rules] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























