// API routes for individual automation
// GET /api/automations/[id] - Get automation
// PATCH /api/automations/[id] - Update automation
// DELETE /api/automations/[id] - Delete automation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { id } = params;

    const { data: automation, error } = await supabase
      .from("automations")
      .select(`
        id,
        company_id,
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
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching automation:", error);
      return NextResponse.json(
        { error: "Failed to fetch automation", details: error.message },
        { status: 500 }
      );
    }

    if (!automation) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ automation });
  } catch (error: any) {
    console.error("Unexpected error in GET /api/automations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { id } = params;
    const body = await req.json();

    const { name, description, is_active } = body;

    // Update automation
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: automation, error } = await supabase
      .from("automations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating automation:", error);
      return NextResponse.json(
        { error: "Failed to update automation", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ automation });
  } catch (error: any) {
    console.error("Unexpected error in PATCH /api/automations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { id } = params;

    // Delete automation (cascade will handle triggers, conditions, actions)
    const { error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting automation:", error);
      return NextResponse.json(
        { error: "Failed to delete automation", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Automation deleted successfully" });
  } catch (error: any) {
    console.error("Unexpected error in DELETE /api/automations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


























