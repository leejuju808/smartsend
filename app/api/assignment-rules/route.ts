import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get assignment rules for this workspace
  const { data: rules, error } = await supabase
    .from("assignment_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ rules: rules || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { type, target, config, is_active = true } = body;

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is owner or admin
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can manage assignment rules" },
      { status: 403 }
    );
  }

  // Validate required fields
  if (!type || !target) {
    return NextResponse.json(
      { error: "type and target are required" },
      { status: 400 }
    );
  }

  if (!["round_robin", "single_owner", "none"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be round_robin, single_owner, or none" },
      { status: 400 }
    );
  }

  if (!["leads", "deals"].includes(target)) {
    return NextResponse.json(
      { error: "Invalid target. Must be leads or deals" },
      { status: 400 }
    );
  }

  // If activating a new rule, deactivate existing active rule for this target
  if (is_active) {
    await supabase
      .from("assignment_rules")
      .update({ is_active: false })
      .eq("workspace_id", workspaceId)
      .eq("target", target)
      .eq("is_active", true);
  }

  // Create new rule
  const { data: rule, error: insertError } = await supabase
    .from("assignment_rules")
    .insert({
      workspace_id: workspaceId,
      type,
      target,
      config: config || {},
      is_active,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: insertError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ rule });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json();

  const { id, type, config, is_active } = body;

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is owner or admin
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Only owners and admins can manage assignment rules" },
      { status: 403 }
    );
  }

  // Get existing rule to get target
  const { data: existingRule } = await supabase
    .from("assignment_rules")
    .select("target")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!existingRule) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  // If activating, deactivate other active rules for this target
  if (is_active === true) {
    await supabase
      .from("assignment_rules")
      .update({ is_active: false })
      .eq("workspace_id", workspaceId)
      .eq("target", existingRule.target)
      .eq("is_active", true)
      .neq("id", id);
  }

  // Build update object
  const updates: any = {};
  if (type !== undefined) updates.type = type;
  if (config !== undefined) updates.config = config;
  if (is_active !== undefined) updates.is_active = is_active;

  // Update rule
  const { data: rule, error: updateError } = await supabase
    .from("assignment_rules")
    .update(updates)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ rule });
}








