// Block 25220 — SmartSend Roofing Multi-Team Support v1
// Team Permission Checking Utilities

import { createClient } from "@/lib/supabase/server";

export type TeamPermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "assign";

export type TeamResourceType =
  | "lead"
  | "job"
  | "insurance_claim"
  | "calendar"
  | "task"
  | "revenue"
  | "billing";

/**
 * Check if user has permission for a resource in a team context
 */
export async function checkTeamPermission(
  userId: string,
  teamId: string,
  resourceType: TeamResourceType,
  action: TeamPermissionAction,
  resourceId?: string
): Promise<boolean> {
  const supabase = createClient();

  // Get team
  const { data: team } = await supabase
    .from("roofing_teams")
    .select("org_id")
    .eq("id", teamId)
    .single();

  if (!team) {
    return false;
  }

  // Check if user is team member
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (!teamMember) {
    return false;
  }

  // Team leaders have all permissions
  if (teamMember.role === "leader") {
    return true;
  }

  // Check specific permission
  let permissionQuery = supabase
    .from("team_permissions")
    .select("can_view, can_create, can_edit, can_delete, can_assign")
    .eq("team_id", teamId)
    .eq("resource_type", resourceType);

  if (resourceId) {
    permissionQuery = permissionQuery.eq("resource_id", resourceId);
  } else {
    permissionQuery = permissionQuery.is("resource_id", null);
  }

  const { data: permission } = await permissionQuery.single();

  if (!permission) {
    // Default permissions based on team type
    return getDefaultPermission(teamMember.role, resourceType, action);
  }

  switch (action) {
    case "view":
      return permission.can_view;
    case "create":
      return permission.can_create;
    case "edit":
      return permission.can_edit;
    case "delete":
      return permission.can_delete;
    case "assign":
      return permission.can_assign;
    default:
      return false;
  }
}

/**
 * Get default permissions based on role and resource type
 */
function getDefaultPermission(
  role: string,
  resourceType: TeamResourceType,
  action: TeamPermissionAction
): boolean {
  // Owners have all permissions
  if (role === "owner") {
    return true;
  }

  // Default permissions matrix
  const permissions: Record<
    string,
    Record<TeamResourceType, Record<TeamPermissionAction, boolean>>
  > = {
    leader: {
      lead: { view: true, create: true, edit: true, delete: false, assign: true },
      job: { view: true, create: true, edit: true, delete: false, assign: true },
      insurance_claim: {
        view: true,
        create: true,
        edit: true,
        delete: false,
        assign: true,
      },
      calendar: { view: true, create: true, edit: true, delete: false, assign: true },
      task: { view: true, create: true, edit: true, delete: false, assign: true },
      revenue: { view: false, create: false, edit: false, delete: false, assign: false },
      billing: { view: false, create: false, edit: false, delete: false, assign: false },
    },
    member: {
      lead: { view: true, create: true, edit: true, delete: false, assign: false },
      job: { view: true, create: false, edit: false, delete: false, assign: false },
      insurance_claim: {
        view: true,
        create: false,
        edit: false,
        delete: false,
        assign: false,
      },
      calendar: { view: true, create: true, edit: true, delete: false, assign: false },
      task: { view: true, create: true, edit: true, delete: false, assign: false },
      revenue: { view: false, create: false, edit: false, delete: false, assign: false },
      billing: { view: false, create: false, edit: false, delete: false, assign: false },
    },
    viewer: {
      lead: { view: true, create: false, edit: false, delete: false, assign: false },
      job: { view: true, create: false, edit: false, delete: false, assign: false },
      insurance_claim: {
        view: true,
        create: false,
        edit: false,
        delete: false,
        assign: false,
      },
      calendar: { view: true, create: false, edit: false, delete: false, assign: false },
      task: { view: true, create: false, edit: false, delete: false, assign: false },
      revenue: { view: false, create: false, edit: false, delete: false, assign: false },
      billing: { view: false, create: false, edit: false, delete: false, assign: false },
    },
  };

  return permissions[role]?.[resourceType]?.[action] ?? false;
}

/**
 * Get user's teams in an organization
 */
export async function getUserTeams(
  userId: string,
  orgId: string
): Promise<
  Array<{
    team_id: string;
    team_name: string;
    team_type: string;
    role: string;
  }>
> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_user_teams", {
    p_org_id: orgId,
    p_user_id: userId,
  });

  if (error) {
    console.error("Error fetching user teams:", error);
    return [];
  }

  return data || [];
}

/**
 * Check if user is member of a team
 */
export async function isTeamMember(
  userId: string,
  teamId: string
): Promise<boolean> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("is_team_member", {
    p_team_id: teamId,
    p_user_id: userId,
  });

  if (error) {
    console.error("Error checking team membership:", error);
    return false;
  }

  return data || false;
}




































