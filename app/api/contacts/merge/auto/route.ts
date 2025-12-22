import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/contacts/merge/auto
 * Automatically merges duplicates (hourly worker)
 * Can be called with workspace_id query param or processes all workspaces
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get authenticated user (optional for system worker)
    const { data: { user } } = await supabase.auth.getUser();
    
    // Get workspace_id from query params (optional)
    const { searchParams } = new URL(req.url);
    const workspaceIdParam = searchParams.get("workspace_id");
    
    let workspaceId: string | null = null;
    
    if (workspaceIdParam) {
      workspaceId = workspaceIdParam;
    } else if (user) {
      // Try to get workspace_id from profiles table if user is authenticated
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();
      
      if (profile?.workspace_id) {
        workspaceId = profile.workspace_id;
      }
    }

    // Call the auto-merge function
    const { data: results, error } = await supabase.rpc(
      "auto_merge_contacts_hourly",
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error auto-merging contacts:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Calculate total merged count
    const totalMerged = (results || []).reduce((sum: number, r: any) => sum + (r.merged_count || 0), 0);

    return NextResponse.json({
      success: true,
      totalMerged,
      results: results || [],
      message: `Automatically merged ${totalMerged} duplicate contact(s)`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/contacts/merge/auto:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































