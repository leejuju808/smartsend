/**
 * Block 110000: Permission helpers for roofing company team members
 */

import { createSupabaseServer } from '@/lib/supabaseServer';

export type Permission =
  | 'can_view_leads'
  | 'can_manage_campaigns'
  | 'can_send_emails'
  | 'can_assign_jobs'
  | 'can_view_revenue'
  | 'can_manage_team'
  | 'can_manage_crews';

/**
 * Check if user has a specific permission in a roofing company
 */
export async function checkPermission(
  roofing_company_id: string,
  user_id: string,
  permission: Permission
): Promise<boolean> {
  const supabase = createSupabaseServer();

  // Use the database function
  const { data, error } = await supabase.rpc('user_has_permission', {
    p_user_id: user_id,
    p_roofing_company_id: roofing_company_id,
    p_permission: permission,
  });

  if (error) {
    console.error('Error checking permission:', error);
    return false;
  }

  return data === true;
}

/**
 * Get user's role in a roofing company
 */
export async function getUserCompanyRole(
  roofing_company_id: string,
  user_id: string
): Promise<string | null> {
  const supabase = createSupabaseServer();

  const { data, error } = await supabase.rpc('get_user_company_role', {
    p_user_id: user_id,
    p_roofing_company_id: roofing_company_id,
  });

  if (error) {
    console.error('Error getting user role:', error);
    return null;
  }

  return data;
}

/**
 * Check if user is owner or admin of a company
 */
export async function isOwnerOrAdmin(
  roofing_company_id: string,
  user_id: string
): Promise<boolean> {
  const role = await getUserCompanyRole(roofing_company_id, user_id);
  return role === 'owner' || role === 'admin';
}

/**
 * Middleware helper: Require permission or return error response
 */
export async function requirePermission(
  roofing_company_id: string,
  user_id: string,
  permission: Permission
): Promise<{ allowed: true } | { allowed: false; error: string; status: number }> {
  const hasPermission = await checkPermission(roofing_company_id, user_id, permission);

  if (!hasPermission) {
    return {
      allowed: false,
      error: 'You do not have permission to perform this action',
      status: 403,
    };
  }

  return { allowed: true };
}

/**
 * Get all permissions for a user in a company
 */
export async function getUserPermissions(
  roofing_company_id: string,
  user_id: string
): Promise<Record<Permission, boolean>> {
  const role = await getUserCompanyRole(roofing_company_id, user_id);

  if (!role) {
    return {
      can_view_leads: false,
      can_manage_campaigns: false,
      can_send_emails: false,
      can_assign_jobs: false,
      can_view_revenue: false,
      can_manage_team: false,
      can_manage_crews: false,
    };
  }

  const supabase = createSupabaseServer();
  const { data: permissions } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('role', role)
    .single();

  if (!permissions) {
    return {
      can_view_leads: false,
      can_manage_campaigns: false,
      can_send_emails: false,
      can_assign_jobs: false,
      can_view_revenue: false,
      can_manage_team: false,
      can_manage_crews: false,
    };
  }

  return {
    can_view_leads: permissions.can_view_leads ?? false,
    can_manage_campaigns: permissions.can_manage_campaigns ?? false,
    can_send_emails: permissions.can_send_emails ?? false,
    can_assign_jobs: permissions.can_assign_jobs ?? false,
    can_view_revenue: permissions.can_view_revenue ?? false,
    can_manage_team: permissions.can_manage_team ?? false,
    can_manage_crews: permissions.can_manage_crews ?? false,
  };
}


























