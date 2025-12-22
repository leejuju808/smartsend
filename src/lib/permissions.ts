// Permission utilities for role-based access control

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Check if a role can invite team members
 */
export function canInvite(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role can assign threads to team members
 */
export function canAssign(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role can send emails/replies
 */
export function canSend(role: Role): boolean {
  return role !== 'viewer';
}

/**
 * Check if a role can edit campaigns
 */
export function canEditCampaign(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a role can manage team members (change roles, remove members)
 */
export function canManageTeam(role: Role): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Get current user's role in a workspace (client-side)
 */
export async function getCurrentUserRole(workspaceId: string, userId: string): Promise<Role | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Try team_members first
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (teamMember) {
      return teamMember.role as Role;
    }

    // Fallback to workspace_members
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (workspaceMember) {
      return workspaceMember.role as Role;
    }

    return null;
  } catch (error) {
    console.error("Error getting user role:", error);
    return null;
  }
}
