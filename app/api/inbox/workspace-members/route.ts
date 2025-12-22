// Block 10700 — Get workspace members for assignee filter
// GET /api/inbox/workspace-members - Get all members of user's workspace(s)

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace membership
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceIds = memberships.map((m) => m.workspace_id);

  // Get all members from user's workspaces
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select(`
      user_id,
      role,
      profiles:user_id (
        email,
        full_name,
        avatar_url
      )
    `)
    .in("workspace_id", workspaceIds);

  if (error) {
    console.error("Error fetching workspace members:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to include email/name
  const membersList = (members || [])
    .map((m: any) => ({
      id: m.user_id,
      name: m.profiles?.full_name || m.profiles?.email || m.user_id.substring(0, 8),
      email: m.profiles?.email || null,
      role: m.role,
      avatar: m.profiles?.avatar_url || null,
    }))
    .filter((m, index, self) => 
      // Deduplicate by user_id (user might be in multiple workspaces)
      index === self.findIndex((t) => t.id === m.id)
    );

  return NextResponse.json({ members: membersList });
}





























































