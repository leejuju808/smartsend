import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contractor/roles
 * Get contractor roles/crew structure
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
      .from("contractor_roles")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ workspace_id: wsId, roles: data || [] });
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
    .from("contractor_roles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ workspace_id: workspaceId, roles: data || [] });
}

/**
 * POST /api/contractor/roles
 * Create or update contractor role (owners/admins only)
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

  const { workspace_id, role_id, ...roleData } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  if (!roleData.role_type) {
    return NextResponse.json({ error: "role_type is required" }, { status: 400 });
  }

  // Verify workspace membership and admin/owner role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can manage roles" }, { status: 403 });
  }

  // Update or insert contractor_role
  let result;
  if (role_id) {
    // Update existing role
    result = await supabase
      .from("contractor_roles")
      .update({
        ...roleData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", role_id)
      .eq("workspace_id", workspace_id)
      .select("*")
      .single();
  } else {
    // Insert new role
    result = await supabase
      .from("contractor_roles")
      .insert({
        workspace_id,
        ...roleData,
      })
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json(result.data);
}

/**
 * DELETE /api/contractor/roles
 * Delete contractor role (owners/admins only)
 */
export async function DELETE(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const roleId = searchParams.get("role_id");
  const workspaceId = searchParams.get("workspace_id") || req.headers.get("x-workspace-id");

  if (!roleId) {
    return NextResponse.json({ error: "role_id is required" }, { status: 400 });
  }

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  // Verify workspace membership and admin/owner role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can delete roles" }, { status: 403 });
  }

  const { error } = await supabase
    .from("contractor_roles")
    .delete()
    .eq("id", roleId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}





















































