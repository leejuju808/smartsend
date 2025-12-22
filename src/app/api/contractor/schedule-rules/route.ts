import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contractor/schedule-rules
 * Get contractor schedule rules
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspace_id") || req.headers.get("x-workspace-id");

  if (!workspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }
    const wsId = membership.workspace_id;

    const { data, error } = await supabase
      .from("contractor_schedule_rules")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ workspace_id: wsId, schedule_rules: data || null });
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("contractor_schedule_rules")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ workspace_id: workspaceId, schedule_rules: data || null });
}

/**
 * POST /api/contractor/schedule-rules
 * Update contractor schedule rules (owners/admins/managers only)
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workspace_id, ...scheduleData } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  // Verify workspace membership and role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  if (!["owner", "admin", "manager"].includes(membership.role)) {
    return NextResponse.json({ error: "Only owners, admins, and managers can update schedule rules" }, { status: 403 });
  }

  // Update contractor_schedule_rules
  const { data: existing } = await supabase
    .from("contractor_schedule_rules")
    .select("id")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  const payload = {
    workspace_id,
    ...scheduleData,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    result = await supabase
      .from("contractor_schedule_rules")
      .update(payload)
      .eq("workspace_id", workspace_id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("contractor_schedule_rules")
      .insert(payload)
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json(result.data);
}





















































