import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// GET /api/saved-views-v2/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getServerSupabase();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // Fetch view
  const { data: view, error } = await supabase
    .from("saved_views")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !view) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  // Check access: user must own it or it must be shared
  if (view.user_id !== user.id && !view.shared) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ 
    ok: true, 
    view 
  });
}

// PUT /api/saved-views-v2/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getServerSupabase();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // Fetch existing view
  const { data: existingView, error: fetchError } = await supabase
    .from("saved_views")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !existingView) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  // Check permissions
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  // User can update own views, or admins/owners can update shared views
  const canUpdate = 
    existingView.user_id === user.id ||
    (existingView.shared && ["owner", "admin"].includes(member.role));

  if (!canUpdate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse request body
  const body = await req.json();
  const { 
    name, 
    config, 
    shared, 
    is_default,
    category 
  } = body;

  // Build update object
  const updates: any = {};
  if (name !== undefined) updates.name = name.trim();
  if (config !== undefined) updates.config = config;
  if (category !== undefined) updates.category = category || null;

  // Handle shared flag: only admins/owners can change it
  if (shared !== undefined) {
    if (shared && !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Only admins/owners can make views shared" }, { status: 403 });
    }
    updates.shared = shared;
  }

  // Handle is_default: unset other defaults if setting this one
  if (is_default !== undefined) {
    updates.is_default = is_default;
    if (is_default) {
      await supabase
        .from("saved_views")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId)
        .eq("user_id", existingView.user_id) // Keep same user_id
        .eq("entity_type", existingView.entity_type)
        .eq("is_default", true)
        .neq("id", params.id);
    }
  }

  // Update view
  const { data: view, error: updateError } = await supabase
    .from("saved_views")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) {
    console.error("Error updating saved view:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true, 
    view 
  });
}

// DELETE /api/saved-views-v2/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getServerSupabase();
  
  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // Fetch existing view
  const { data: existingView, error: fetchError } = await supabase
    .from("saved_views")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !existingView) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  // Check permissions
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  // User can delete own views, or admins/owners can delete shared views
  const canDelete = 
    existingView.user_id === user.id ||
    (existingView.shared && ["owner", "admin"].includes(member.role));

  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete view
  const { error: deleteError } = await supabase
    .from("saved_views")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    console.error("Error deleting saved view:", deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true 
  });
}



