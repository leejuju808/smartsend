// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Execute Assignment Rule
// POST /api/teams/assignment-rules/[id]/execute - Execute rule on an entity

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { entity_type, entity_id, entity_data = {} } = body;

    if (!entity_type || !entity_id) {
      return NextResponse.json(
        { error: "entity_type and entity_id are required" },
        { status: 400 }
      );
    }

    // Get rule
    const { data: rule, error: ruleError } = await supabase
      .from("team_assignment_rules")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (ruleError || !rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Verify rule matches entity type
    if (rule.target_type !== entity_type) {
      return NextResponse.json(
        { error: "Rule target type does not match entity type" },
        { status: 400 }
      );
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", rule.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Execute rule using database function
    const { data: result, error: executeError } = await supabase.rpc(
      "execute_assignment_rule",
      {
        p_rule_id: id,
        p_entity_type: entity_type,
        p_entity_id: entity_id,
        p_entity_data: entity_data,
      }
    );

    if (executeError) {
      console.error("Error executing assignment rule:", executeError);
      return NextResponse.json(
        { error: "Failed to execute assignment rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      assigned_id: result,
    });
  } catch (error) {
    console.error(
      "Error in POST /api/teams/assignment-rules/[id]/execute:",
      error
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































