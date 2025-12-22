import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contacts/duplicates
 * Returns list of suspected duplicate contacts for manual review
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

    // Call the duplicate detection function
    const { data: duplicates, error } = await supabase.rpc(
      "detect_contact_duplicates_v2",
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error detecting duplicates:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Group duplicates by group_id
    const groupedDuplicates: Record<string, any[]> = {};
    (duplicates || []).forEach((dup: any) => {
      if (!groupedDuplicates[dup.group_id]) {
        groupedDuplicates[dup.group_id] = [];
      }
      groupedDuplicates[dup.group_id].push(dup);
    });

    // Transform to array of groups
    const duplicateGroups = Object.values(groupedDuplicates).map((group) => ({
      groupId: group[0].group_id,
      matchType: group[0].match_type,
      matchScore: group[0].match_score,
      matchReason: group[0].match_reason,
      contacts: group.map((c: any) => ({
        id: c.contact_id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        street: c.street,
        city: c.city,
        zip: c.zip,
        tags: c.tags,
      })),
    }));

    return NextResponse.json({
      success: true,
      duplicates: duplicateGroups,
      count: duplicateGroups.length,
    });
  } catch (error: any) {
    console.error("Error in GET /api/contacts/duplicates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
