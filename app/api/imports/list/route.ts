import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/imports/list
 * Returns import history for the user's workspace
 * 
 * Query params:
 *   workspaceId: string (required)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("team_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!member) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Get imports
    const { data: imports, error } = await supabase
      .from("imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get user emails from profiles table if available, otherwise use user_id
    const userIds = [...new Set((imports || []).map((imp: any) => imp.user_id))];
    const userEmailsMap: Record<string, string> = {};
    
    // Try to get emails from profiles table
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);
      
      if (profiles) {
        profiles.forEach((p: any) => {
          if (p.id && p.email) {
            userEmailsMap[p.id] = p.email;
          }
        });
      }
    }

    // Format response with user email
    const formatted = (imports || []).map((imp: any) => ({
      id: imp.id,
      filename: imp.filename,
      workspace_id: imp.workspace_id,
      user_id: imp.user_id,
      uploaded_by: userEmailsMap[imp.user_id] || `User ${imp.user_id.slice(0, 8)}`,
      total_rows: imp.total_rows || 0,
      success_rows: imp.success_rows || 0,
      failed_rows: imp.failed_rows || 0,
      duplicate_rows: imp.duplicate_rows || 0,
      enriched_rows: imp.enriched_rows || 0,
      ignored_rows: imp.ignored_rows || 0,
      created_at: imp.created_at,
      mapping: imp.mapping,
      error_file_url: imp.error_file_url,
    }));

    return NextResponse.json(formatted);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch imports" },
      { status: 500 }
    );
  }
}

