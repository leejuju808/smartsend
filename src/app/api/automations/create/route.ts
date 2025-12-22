// Block 232000 — Automation Engine API
// POST /api/automations/create - Create a new automation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { error: "No roofing company found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      name,
      description,
      trigger_type,
      trigger_value,
      conditions = {},
      actions = [],
    } = body;

    // Validate required fields
    if (!name || !trigger_type || !trigger_value) {
      return NextResponse.json(
        { error: "Missing required fields: name, trigger_type, trigger_value" },
        { status: 400 }
      );
    }

    // Validate trigger_type
    const validTriggerTypes = ['event', 'schedule', 'condition'];
    if (!validTriggerTypes.includes(trigger_type)) {
      return NextResponse.json(
        { error: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate actions
    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json(
        { error: "At least one action is required" },
        { status: 400 }
      );
    }

    const validActionTypes = [
      'send_email',
      'send_sms',
      'add_activity_note',
      'assign_user',
      'assign_crew',
      'create_task',
      'move_pipeline_stage',
      'change_status',
      'notify_customer_portal',
      'recalculate_payment_schedule',
      'generate_document',
      'apply_tags',
      'trigger_webhook',
    ];

    for (const action of actions) {
      if (!action.action_type || !validActionTypes.includes(action.action_type)) {
        return NextResponse.json(
          { error: `Invalid action_type: ${action.action_type}. Must be one of: ${validActionTypes.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Create the automation
    const { data: automation, error: createError } = await supabase
      .from("automations")
      .insert({
        roofing_company_id: companyId,
        name,
        description,
        trigger_type,
        trigger_value,
        conditions,
        active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("[Automations] Create error:", createError);
      return NextResponse.json(
        { error: "Failed to create automation" },
        { status: 500 }
      );
    }

    // Create actions
    const actionInserts = actions.map((action: any, index: number) => ({
      automation_id: automation.id,
      action_type: action.action_type,
      action_payload: action.action_payload || {},
      sort_order: action.sort_order !== undefined ? action.sort_order : index,
    }));

    const { error: actionsError } = await supabase
      .from("automation_actions")
      .insert(actionInserts);

    if (actionsError) {
      console.error("[Automations] Actions create error:", actionsError);
      // Rollback automation creation
      await supabase.from("automations").delete().eq("id", automation.id);
      return NextResponse.json(
        { error: "Failed to create automation actions" },
        { status: 500 }
      );
    }

    // Fetch the complete automation with actions
    const { data: completeAutomation, error: fetchError } = await supabase
      .from("automations")
      .select(`
        *,
        automation_actions (
          id,
          action_type,
          action_payload,
          sort_order
        )
      `)
      .eq("id", automation.id)
      .single();

    if (fetchError) {
      console.error("[Automations] Fetch error:", fetchError);
    }

    return NextResponse.json(
      { automation: completeAutomation || automation },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Automations] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























