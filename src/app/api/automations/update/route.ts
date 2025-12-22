// Block 232000 — Automation Engine API
// POST /api/automations/update - Update an automation

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
      id,
      name,
      description,
      trigger_type,
      trigger_value,
      conditions,
      actions,
      active,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Verify automation belongs to company
    const { data: existing, error: fetchError } = await supabase
      .from("automations")
      .select("id")
      .eq("id", id)
      .eq("roofing_company_id", companyId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      );
    }

    // Update automation
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (trigger_type !== undefined) updateData.trigger_type = trigger_type;
    if (trigger_value !== undefined) updateData.trigger_value = trigger_value;
    if (conditions !== undefined) updateData.conditions = conditions;
    if (active !== undefined) updateData.active = active;

    const { data: automation, error: updateError } = await supabase
      .from("automations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[Automations] Update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update automation" },
        { status: 500 }
      );
    }

    // Update actions if provided
    if (actions && Array.isArray(actions)) {
      // Delete existing actions
      await supabase
        .from("automation_actions")
        .delete()
        .eq("automation_id", id);

      // Insert new actions
      const actionInserts = actions.map((action: any, index: number) => ({
        automation_id: id,
        action_type: action.action_type,
        action_payload: action.action_payload || {},
        sort_order: action.sort_order !== undefined ? action.sort_order : index,
      }));

      const { error: actionsError } = await supabase
        .from("automation_actions")
        .insert(actionInserts);

      if (actionsError) {
        console.error("[Automations] Actions update error:", actionsError);
        return NextResponse.json(
          { error: "Failed to update automation actions" },
          { status: 500 }
        );
      }
    }

    // Fetch complete automation
    const { data: completeAutomation, error: fetchError2 } = await supabase
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
      .eq("id", id)
      .single();

    return NextResponse.json({
      automation: completeAutomation || automation,
    });
  } catch (error: any) {
    console.error("[Automations] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























