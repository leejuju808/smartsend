// /lib/workspace/withWorkspace.ts (API guard)
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export type WorkspaceRole = "owner" | "admin" | "member" | "readonly";

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
}

/**
 * Require user to be a workspace member
 */
export async function requireWorkspace(req: NextRequest) {
  const supabase = getServerSupabase();
  
  // Check authentication first
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const wid = req.headers.get("x-workspace-id") || new URL(req.url).searchParams.get("wid");
  if (!wid) {
    return { error: NextResponse.json({ error: "Missing workspace" }, { status: 400 }) };
  }

  const { data: ok } = await supabase.rpc("is_workspace_member", { p_ws: wid, p_uid: user.id });
  if (!ok) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  
  return { workspace_id: wid, user };
}

/**
 * Require user to be workspace admin or owner
 */
export async function requireWorkspaceAdmin(req: NextRequest) {
  const supabase = getServerSupabase();
  
  // Check authentication first
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const wid = req.headers.get("x-workspace-id") || new URL(req.url).searchParams.get("wid");
  if (!wid) {
    return { error: NextResponse.json({ error: "Missing workspace" }, { status: 400 }) };
  }

  const { data: ok } = await supabase.rpc("is_workspace_admin", { p_ws: wid });
  if (!ok) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  
  return { workspace_id: wid, user };
}

/**
 * Require user to have one of the specified roles
 */
export async function requireWorkspaceRole(
  req: NextRequest,
  requiredRoles: WorkspaceRole[]
): Promise<{ error: NextResponse } | { workspace_id: string; user: any; role: WorkspaceRole }> {
  const supabase = getServerSupabase();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const wid = req.headers.get("x-workspace-id") || new URL(req.url).searchParams.get("wid");
  if (!wid) {
    return { error: NextResponse.json({ error: "Missing workspace" }, { status: 400 }) };
  }

  // Get user's role
  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", wid)
    .eq("user_id", user.id)
    .single();

  if (!member || !requiredRoles.includes(member.role as WorkspaceRole)) {
    return { 
      error: NextResponse.json(
        { error: `Requires one of: ${requiredRoles.join(", ")}` }, 
        { status: 403 }
      ) 
    };
  }

  return { workspace_id: wid, user, role: member.role as WorkspaceRole };
}

/**
 * Get user's role in workspace (returns null if not a member)
 */
export async function getWorkspaceRole(
  workspaceId: string,
  userId: string
): Promise<WorkspaceRole | null> {
  const supabase = getServerSupabase();
  
  const { data: role } = await supabase.rpc("get_workspace_role", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  return role || null;
}

/**
 * Check if user can edit a resource (campaign, etc.)
 * Rules:
 * - Owner/Admin can edit anything
 * - Member can edit if they created it
 * - Readonly cannot edit
 */
export async function canEditResource(
  workspaceId: string,
  userId: string,
  createdBy: string | null
): Promise<boolean> {
  const role = await getWorkspaceRole(workspaceId, userId);
  
  if (!role) return false;
  if (role === "readonly") return false;
  if (role === "owner" || role === "admin") return true;
  if (role === "member" && createdBy === userId) return true;
  
  return false;
}

/**
 * Check if user can perform admin actions (manage team, billing, etc.)
 */
export async function canPerformAdminAction(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const role = await getWorkspaceRole(workspaceId, userId);
  return role === "owner" || role === "admin";
}

/**
 * Check if user can view resource (all members can view)
 */
export async function canViewResource(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const role = await getWorkspaceRole(workspaceId, userId);
  return role !== null;
}