import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * GET /api/workspaces/[id]/team-members
 * Get all team members for a workspace
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a member of this workspace
  const { data: membership } = await supabase
    .from("team_members")
    .select("id")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  // Fallback to workspace_members
  if (!membership) {
    const { data: wsMembership } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", params.id)
      .eq("user_id", user.id)
      .single();

    if (!wsMembership) {
      return NextResponse.json(
        { error: "Not a member of this workspace" },
        { status: 403 }
      );
    }
  }

  // Get all team members
  const { data: teamMembers, error: tmError } = await supabase
    .from("team_members")
    .select("user_id, email, role")
    .eq("workspace_id", params.id)
    .eq("status", "active");

  if (tmError) {
    // Fallback to workspace_members
    const { data: wsMembers, error: wsError } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", params.id);

    if (wsError) {
      return NextResponse.json(
        { error: "Failed to load team members" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      members: wsMembers || [],
    });
  }

  return NextResponse.json({
    members: teamMembers || [],
  });
}









