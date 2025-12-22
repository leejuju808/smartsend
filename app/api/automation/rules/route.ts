// Block 75000 — Automation Rules API
// GET /api/automation/rules - List all automation rules
// POST /api/automation/rules - Create a new automation rule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
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

    // Get all automation rules for this workspace
    const { data: rules, error: rulesError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (rulesError) {
      console.error("[Automation Rules] Fetch error:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch automation rules" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (error: any) {
    console.error("[Automation Rules] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

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

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      trigger_type,
      conditions = {},
      action_type,
      action_payload = {},
      enabled = true,
      company_id = null,
    } = body;

    // Validate required fields
    if (!name || !trigger_type || !action_type) {
      return NextResponse.json(
        { error: "Missing required fields: name, trigger_type, action_type" },
        { status: 400 }
      );
    }

    // Validate trigger_type
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
    if (!validTriggerTypes.includes(trigger_type)) {
      return NextResponse.json(
        { error: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate action_type
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
    if (!validActionTypes.includes(action_type)) {
      return NextResponse.json(
        { error: `Invalid action_type. Must be one of: ${validActionTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Create the rule
    const { data: rule, error: createError } = await supabase
      .from("automation_rules")
      .insert({
        workspace_id: workspaceId,
        company_id: company_id,
        name,
        description,
        trigger_type,
        conditions,
        action_type,
        action_payload,
        enabled,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("[Automation Rules] Create error:", createError);
      return NextResponse.json(
        { error: "Failed to create automation rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error("[Automation Rules] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























