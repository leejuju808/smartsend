import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contacts/auto-merge
 * Automatically merges contacts with exact email or phone matches
 * 
 * Query params: workspace_id (optional, will try to get from user profile)
 */
export async function POST(req: NextRequest) {
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

    // Call the auto-merge function
    const { data: mergedCount, error } = await supabase.rpc(
      "auto_merge_exact_duplicates",
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error auto-merging duplicates:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      mergedCount: mergedCount || 0,
      message: `Automatically merged ${mergedCount || 0} duplicate contact(s)`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/contacts/auto-merge:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

