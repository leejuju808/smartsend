/**
 * Block 12900: Organization Roles & Permissions v1
 * Permission checking utilities for role-based access control
 */

import { createSupabaseServer } from '@/lib/supabaseServer';

export type OrgRole = 'owner' | 'manager' | 'staff' | 'read_only';

export type PermissionAction =
  // Campaign permissions
  | 'campaign.create'
  | 'campaign.edit'
  | 'campaign.activate'
  | 'campaign.view'
  // Contact permissions
  | 'contacts.view'
  | 'contacts.edit'
  | 'contacts.import'
  | 'contacts.delete'
  // Inbox permissions
  | 'inbox.view'
  | 'inbox.reply'
  | 'inbox.snooze'
  | 'inbox.assign'
  // Pipeline permissions
  | 'pipeline.view'
  | 'pipeline.update'
  | 'pipeline.add_inspection'
  | 'pipeline.add_estimate'
  | 'pipeline.add_job_won'
  // Revenue permissions
  | 'revenue.view'
  // Billing permissions
  | 'billing.view'
  | 'billing.manage'
  | 'billing.change_plan'
  // Team management permissions
  | 'team.add_user'
  | 'team.remove_user'
  | 'team.change_role'
  // Sending permissions
  | 'send_emails';

/**
 * Get user's role in an organization
 */
export async function getUserOrgRole(
  orgId: string,
  userId: string
): Promise<OrgRole | null> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc('get_user_org_role', {
      p_org_id: orgId,
      p_user_id: userId,
    });

    if (error || !data) {
      return null;
    }

    return data as OrgRole;
  } catch (error) {
    console.error('Error getting user org role:', error);
    return null;
  }
}

/**
 * Check if user has permission for an action
 */
export async function checkPermission(
  orgId: string,
  userId: string,
  action: PermissionAction
): Promise<boolean> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc('check_permission', {
      p_org_id: orgId,
      p_user_id: userId,
      p_action: action,
    });

    if (error) {
      console.error('Error checking permission:', error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

/**
 * Check if user is member of organization
 */
export async function isOrgMember(
  orgId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc('is_org_member', {
      p_org_id: orgId,
      p_user_id: userId,
    });

    if (error) {
      return false;
    }

    return data === true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if user is owner or manager
 */
export async function isOrgAdmin(
  orgId: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = createSupabaseServer();
    const { data, error } = await supabase.rpc('is_org_admin', {
      p_org_id: orgId,
      p_user_id: userId,
    });

    if (error) {
      return false;
    }

    return data === true;
  } catch (error) {
    return false;
  }
}

/**
 * Get current user's role in active org
 */
export async function getCurrentUserRole(): Promise<OrgRole | null> {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    // Get current org from user's active org
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.current_org_id) {
      return null;
    }

    return getUserOrgRole(profile.current_org_id, user.id);
  } catch (error) {
    console.error('Error getting current user role:', error);
    return null;
  }
}

/**
 * Require permission - throws error if user doesn't have permission
 */
export async function requirePermission(
  orgId: string,
  userId: string,
  action: PermissionAction
): Promise<void> {
  const hasPermission = await checkPermission(orgId, userId, action);
  
  if (!hasPermission) {
    throw new Error('insufficient_permissions');
  }
}

/**
 * Permission matrix helper functions
 */
export const Permissions = {
  // Campaign permissions
  canCreateCampaign: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canEditCampaign: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canActivateCampaign: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canViewCampaign: (role: OrgRole | null) => role !== null,

  // Contact permissions
  canViewContacts: (role: OrgRole | null) => role !== null,
  canEditContacts: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canImportContacts: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canDeleteContacts: (role: OrgRole | null) => role === 'owner' || role === 'manager',

  // Inbox permissions
  canViewInbox: (role: OrgRole | null) => role !== null,
  canReplyInbox: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canSnoozeInbox: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canAssignInbox: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',

  // Pipeline permissions
  canViewPipeline: (role: OrgRole | null) => role !== null,
  canUpdatePipeline: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canAddInspection: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canAddEstimate: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
  canAddJobWon: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',

  // Revenue permissions
  canViewRevenue: (role: OrgRole | null) => role === 'owner' || role === 'manager',

  // Billing permissions
  canViewBilling: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canManageBilling: (role: OrgRole | null) => role === 'owner',
  canChangePlan: (role: OrgRole | null) => role === 'owner',

  // Team management permissions
  canAddUser: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canRemoveUser: (role: OrgRole | null) => role === 'owner' || role === 'manager',
  canChangeRole: (role: OrgRole | null) => role === 'owner' || role === 'manager',

  // Sending permissions
  canSendEmails: (role: OrgRole | null) => role === 'owner' || role === 'manager' || role === 'staff',
};




























































