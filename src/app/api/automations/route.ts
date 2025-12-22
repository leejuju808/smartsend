// API routes for automations CRUD
// GET /api/automations - List automations
// POST /api/automations - Create automation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Fetch automations with their triggers, conditions, and actions
    const { data: automations, error } = await supabase
      .from("automations")
      .select(`
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at,
        automation_triggers (
          id,
          event_key
        ),
        automation_conditions (
          id,
          field,
          operator,
          value
        ),
        automation_actions (
          id,
          action_key,
          payload,
          action_order
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching automations:", error);
      return NextResponse.json(
        { error: "Failed to fetch automations", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ automations: automations || [] });
  } catch (error: any) {
    console.error("Unexpected error in GET /api/automations:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      company_id,
      name,
      description,
      is_active = true,
      trigger,
      conditions = [],
      actions = [],
    } = body;

    if (!company_id || !name || !trigger) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, name, trigger" },
        { status: 400 }
      );
    }

    // Create automation
    const { data: automation, error: automationError } = await supabase
      .from("automations")
      .insert({
        company_id,
        name,
        description,
        is_active,
      })
      .select()
      .single();

    if (automationError || !automation) {
      console.error("Error creating automation:", automationError);
      return NextResponse.json(
        { error: "Failed to create automation", details: automationError?.message },
        { status: 500 }
      );
    }

    // Create trigger
    const { error: triggerError } = await supabase
      .from("automation_triggers")
      .insert({
        automation_id: automation.id,
        event_key: trigger.event_key,
      });

    if (triggerError) {
      console.error("Error creating trigger:", triggerError);
      // Clean up automation if trigger creation fails
      await supabase.from("automations").delete().eq("id", automation.id);
      return NextResponse.json(
        { error: "Failed to create trigger", details: triggerError.message },
        { status: 500 }
      );
    }

    // Create conditions
    if (conditions.length > 0) {
      const conditionsToInsert = conditions.map((c: any) => ({
        automation_id: automation.id,
        field: c.field,
        operator: c.operator,
        value: c.value,
      }));

      const { error: conditionsError } = await supabase
        .from("automation_conditions")
        .insert(conditionsToInsert);

      if (conditionsError) {
        console.error("Error creating conditions:", conditionsError);
        // Clean up
        await supabase.from("automations").delete().eq("id", automation.id);
        return NextResponse.json(
          { error: "Failed to create conditions", details: conditionsError.message },
          { status: 500 }
        );
      }
    }

    // Create actions
    if (actions.length > 0) {
      const actionsToInsert = actions.map((a: any, index: number) => ({
        automation_id: automation.id,
        action_key: a.action_key,
        payload: a.payload || {},
        action_order: a.action_order !== undefined ? a.action_order : index,
      }));

      const { error: actionsError } = await supabase
        .from("automation_actions")
        .insert(actionsToInsert);

      if (actionsError) {
        console.error("Error creating actions:", actionsError);
        // Clean up
        await supabase.from("automations").delete().eq("id", automation.id);
        return NextResponse.json(
          { error: "Failed to create actions", details: actionsError.message },
          { status: 500 }
        );
      }
    }

    // Fetch complete automation with relations
    const { data: completeAutomation, error: fetchError } = await supabase
      .from("automations")
      .select(`
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at,
        automation_triggers (
          id,
          event_key
        ),
        automation_conditions (
          id,
          field,
          operator,
          value
        ),
        automation_actions (
          id,
          action_key,
          payload,
          action_order
        )
      `)
      .eq("id", automation.id)
      .single();

    return NextResponse.json({ automation: completeAutomation }, { status: 201 });
  } catch (error: any) {
    console.error("Unexpected error in POST /api/automations:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


























