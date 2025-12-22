import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// GET /api/saved-views-v2/list?entity_type=leads
export async function GET(req: NextRequest) {
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

  // Get entity_type from query params
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entity_type");
  
  if (!entityType) {
    return NextResponse.json({ error: "entity_type is required" }, { status: 400 });
  }

  // Fetch views: user's own views + shared views in workspace
  const { data: views, error } = await supabase
    .from("saved_views")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", entityType)
    .or(`user_id.eq.${user.id},shared.eq.true`)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved views:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    ok: true, 
    views: views ?? [] 
  });
}



