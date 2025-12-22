// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Assignment Rule Management (Single Rule)
// GET /api/teams/assignment-rules/[id] - Get rule
// PATCH /api/teams/assignment-rules/[id] - Update rule
// DELETE /api/teams/assignment-rules/[id] - Delete rule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    // Get rule
    const { data: rule, error: ruleError } = await supabase
      .from("team_assignment_rules")
      .select("*")
      .eq("id", id)
      .single();

    if (ruleError || !rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
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

    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Error in GET /api/teams/assignment-rules/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // Get rule
    const { data: rule } = await supabase
      .from("team_assignment_rules")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Verify user is owner/admin
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", rule.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can update assignment rules" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, description, config, priority, is_active } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (config !== undefined) updates.config = config;
    if (priority !== undefined) updates.priority = priority;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: updatedRule, error: updateError } = await supabase
      .from("team_assignment_rules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating assignment rule:", updateError);
      return NextResponse.json(
        { error: "Failed to update assignment rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rule: updatedRule });
  } catch (error) {
    console.error("Error in PATCH /api/teams/assignment-rules/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Get rule
    const { data: rule } = await supabase
      .from("team_assignment_rules")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    // Verify user is owner/admin
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", rule.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can delete assignment rules" },
        { status: 403 }
      );
    }

    // Soft delete
    const { error: deleteError } = await supabase
      .from("team_assignment_rules")
      .update({ is_active: false })
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting assignment rule:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete assignment rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/teams/assignment-rules/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































