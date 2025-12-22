import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contacts/duplicates/count
 * Returns count of duplicate groups for UI badges
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or user profile
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspace_id");
    
    let workspaceId: string;
    
    if (workspaceIdParam) {
      workspaceId = workspaceIdParam;
    } else {
      // Try to get workspace_id from profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();
      
      if (!profile?.workspace_id) {
        return NextResponse.json(
          { error: "Workspace ID required" },
          { status: 400 }
        );
      }
      workspaceId = profile.workspace_id;
    }

    // Get duplicate count
    const { data: count, error } = await supabase.rpc(
      "get_contact_duplicate_count",
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error getting duplicate count:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Get recent merge count (last 24 hours)
    const { data: recentMerges } = await supabase.rpc(
      "get_recent_merge_count",
      { 
        p_workspace_id: workspaceId,
        p_hours: 24
      }
    );

    return NextResponse.json({
      success: true,
      duplicateGroups: count || 0,
      recentMerges: recentMerges || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/contacts/duplicates/count:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































