import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // For now, get all rules (we'll add workspace filtering later)
    const { data: rules, error } = await supabase
      .from("automation_rules")
      .select(`
        *,
        automation_actions (*)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching rules:", error);
      return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
    }

    return NextResponse.json(rules || []);
  } catch (error) {
    console.error("Error in GET /api/automation/rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, trigger_type, event_type, condition_json, actions, workspace_id } = await req.json();

    // Validate required fields
    if (!name || !trigger_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Create the rule (workspace_id will be added later when auth is implemented)
    const { data: rule, error: ruleError } = await supabase
      .from("automation_rules")
      .insert({
        workspace_id: workspace_id || "00000000-0000-0000-0000-000000000000", // placeholder
        name,
        trigger_type,
        event_type: trigger_type === "event" ? event_type : null,
        condition_json: condition_json || {}
      })
      .select()
      .single();

    if (ruleError) {
      console.error("Error creating rule:", ruleError);
      return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
    }

    // Create actions if provided
    if (actions && Array.isArray(actions) && actions.length > 0) {
      const actionData = actions.map((action: any) => ({
        rule_id: rule.id,
        action_type: action.action_type,
        action_payload: action.action_payload || {}
      }));

      const { error: actionError } = await supabase
        .from("automation_actions")
        .insert(actionData);

      if (actionError) {
        console.error("Error creating actions:", actionError);
        // Don't fail the whole request if actions fail
      }
    }

    return NextResponse.json({ 
      success: true, 
      id: rule.id,
      message: "Automation rule created successfully" 
    });
  } catch (error) {
    console.error("Error in POST /api/automation/rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, name, is_enabled, trigger_type, event_type, condition_json, actions } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing rule ID" }, { status: 400 });
    }

    // Update the rule (workspace filtering will be added later when auth is implemented)
    const { error: ruleError } = await supabase
      .from("automation_rules")
      .update({
        name,
        is_enabled,
        trigger_type,
        event_type: trigger_type === "event" ? event_type : null,
        condition_json: condition_json || {},
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (ruleError) {
      console.error("Error updating rule:", ruleError);
      return NextResponse.json({ error: "Failed to update rule" }, { status: 500 });
    }

    // Update actions if provided
    if (actions && Array.isArray(actions)) {
      // Delete existing actions
      await supabase
        .from("automation_actions")
        .delete()
        .eq("rule_id", id);

      // Create new actions
      if (actions.length > 0) {
        const actionData = actions.map((action: any) => ({
          rule_id: id,
          action_type: action.action_type,
          action_payload: action.action_payload || {}
        }));

        const { error: actionError } = await supabase
          .from("automation_actions")
          .insert(actionData);

        if (actionError) {
          console.error("Error updating actions:", actionError);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: "Automation rule updated successfully" 
    });
  } catch (error) {
    console.error("Error in PUT /api/automation/rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing rule ID" }, { status: 400 });
    }

    // Delete the rule (actions will be deleted via CASCADE)
    // Workspace filtering will be added later when auth is implemented
    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting rule:", error);
      return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Automation rule deleted successfully" 
    });
  } catch (error) {
    console.error("Error in DELETE /api/automation/rules:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 