// lib/middleware/enforceRole.ts
// Block 265: Team Permissions v1 - Role Enforcement Middleware

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

export type Role = "owner" | "admin" | "member" | "read_only";

interface TeamMember {
  workspace_id: string;
  role: Role;
  status: string;
}

/**
 * Get current team member for the authenticated user
 */
export async function getCurrentTeamMember(workspaceId?: string): Promise<TeamMember | null> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // If workspaceId is provided, use it; otherwise find user's workspace
  if (workspaceId) {
    const { data: member } = await supabase
      .from("team_members")
      .select("workspace_id, role, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    return member || null;
  }

  // Get user's first active workspace membership
  const { data: member } = await supabase
    .from("team_members")
    .select("workspace_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  return member || null;
}

/**
 * Enforce that the current user has one of the required roles
 * Returns an error response if not authorized, or the team member if authorized
 */
export async function enforceRole(
  required: Role[],
  workspaceId?: string
): Promise<{ error: NextResponse } | { member: TeamMember }> {
  const member = await getCurrentTeamMember(workspaceId);

  if (!member) {
    return {
      error: NextResponse.json({ error: "Unauthorized: Not a team member" }, { status: 401 }),
    };
  }

  if (!required.includes(member.role)) {
    return {
      error: NextResponse.json(
        { error: `Forbidden: Requires one of: ${required.join(", ")}` },
        { status: 403 }
      ),
    };
  }

  return { member };
}

/**
 * Check if user can perform an action based on role
 */
export function canPerformAction(role: Role, action: "billing" | "invite" | "edit" | "view"): boolean {
  switch (action) {
    case "billing":
      return role === "owner";
    case "invite":
      return role === "owner" || role === "admin";
    case "edit":
      return role === "owner" || role === "admin" || role === "member";
    case "view":
      return true; // All roles can view
    default:
      return false;
  }
}









