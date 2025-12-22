import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// POST /api/saved-views-v2/[id]/duplicate
export async function POST(
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

  // Fetch source view
  const { data: sourceView, error: fetchError } = await supabase
    .from("saved_views")
    .select("*")
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !sourceView) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  // Check access: user must be able to see the view
  if (sourceView.user_id !== user.id && !sourceView.shared) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse request body for optional name override
  const body = await req.json();
  const newName = body.name || `${sourceView.name} (Copy)`;

  // Create duplicate (as private view for current user)
  const { data: duplicatedView, error: insertError } = await supabase
    .from("saved_views")
    .insert({
      workspace_id: workspaceId,
      user_id: user.id,
      name: newName,
      entity_type: sourceView.entity_type,
      config: sourceView.config,
      shared: false, // Always create as private
      is_default: false,
      category: sourceView.category,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Error duplicating saved view:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true, 
    view: duplicatedView 
  });
}



