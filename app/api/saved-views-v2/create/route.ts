import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/saved-views-v2/create
export async function POST(req: NextRequest) {
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

  // Verify user is workspace member
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
  }

  // Parse request body
  const body = await req.json();
  const { 
    name, 
    entity_type, 
    config, 
    shared = false, 
    is_default = false,
    category 
  } = body;

  // Validate required fields
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!entity_type || !["leads", "campaigns", "inboxes", "sequences", "events", "domains"].includes(entity_type)) {
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  }

  // Check permissions: readonly users cannot create views
  if (member.role === "readonly") {
    return NextResponse.json({ error: "Readonly users cannot create views" }, { status: 403 });
  }

  // Check permissions: only admins/owners can create shared views
  if (shared && !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "Only admins/owners can create shared views" }, { status: 403 });
  }

  // If setting as default, unset other defaults for this user/entity
  if (is_default) {
    await supabase
      .from("saved_views")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("entity_type", entity_type)
      .eq("is_default", true);
  }

  // Create view
  const { data: view, error: insertError } = await supabase
    .from("saved_views")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      name: name.trim(),
      entity_type,
      config: config ?? {},
      shared,
      is_default,
      category: category || null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error creating saved view:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true, 
    view 
  });
}



