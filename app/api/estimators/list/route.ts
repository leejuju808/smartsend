import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all workspace members (estimators/owners/admins)
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select(
      `
      user_id,
      role,
      profile:profiles!workspace_members_user_id_fkey(
        id,
        full_name,
        email
      )
    `
    )
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin", "member"]);

  if (membersError) {
    console.error("Error fetching estimators:", membersError);
    return NextResponse.json(
      { error: membersError.message },
      { status: 500 }
    );
  }

  // Map to simple profile format
  const estimators =
    members
      ?.map((m) => ({
        id: m.profile?.id || m.user_id,
        full_name: m.profile?.full_name || null,
        email: m.profile?.email || null,
        role: m.role,
      }))
      .filter((e) => e.id) || [];

  return NextResponse.json(estimators);
}









































