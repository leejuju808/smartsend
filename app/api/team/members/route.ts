// Block 20170 — Team Members API (for assignment)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get active workspace ID
    const workspaceId = await getActiveWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ members: [] }, { status: 200 });
    }

    // Get all workspace members with profile info
    const { data: members, error } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        profiles:user_id (
          id,
          full_name,
          email
        )
      `)
      .eq("workspace_id", workspaceId);

    if (error) {
      console.error("Team members fetch error", error);
      return NextResponse.json(
        { error: "Failed to load team members" },
        { status: 500 }
      );
    }

    // Transform to match expected format
    const membersList = (members || [])
      .map((m: any) => ({
        id: m.user_id,
        full_name: m.profiles?.full_name || null,
        email: m.profiles?.email || null,
      }))
      .filter((m) => m.id) // Filter out any invalid entries
      .sort((a, b) => {
        // Sort by full_name, then email
        const aName = a.full_name || a.email || "";
        const bName = b.full_name || b.email || "";
        return aName.localeCompare(bName);
      });

    return NextResponse.json({ members: membersList });
  } catch (error: any) {
    console.error("Error in /api/team/members:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
