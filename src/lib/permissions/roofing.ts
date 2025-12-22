// Permission checking utilities for roofing companies
// Block 231000 — Company Settings + Roles & Permissions

import { createClient } from "@/lib/supabase/server";

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export type Module = 'leads' | 'estimates' | 'contracts' | 'production' | 'safety' | 'payments' | 'accounting' | 'settings' | 'team';

export interface UserPermissions {
  role: string;
  permissions: Record<Module, {
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
}

/**
 * Get user permissions for a company
 */
export async function getUserPermissions(
  userId: string,
  roofingCompanyId: string
): Promise<UserPermissions | null> {
  const supabase = createClient();

  // Get user's role
  const { data: member, error: memberError } = await supabase
    .from("roofing_company_members")
    .select("role")
    .eq("roofing_company_id", roofingCompanyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (memberError || !member) {
    return null;
  }

  // Get permissions for this role
  const { data: permissions, error: permissionsError } = await supabase
    .from("roles_permissions")
    .select("*")
    .eq("role", member.role);

  if (permissionsError || !permissions) {
    return null;
  }

  // Format permissions as a map
  const permissionsMap: Record<Module, any> = {} as any;
  permissions.forEach((perm: any) => {
    permissionsMap[perm.module as Module] = {
      can_view: perm.can_view,
      can_create: perm.can_create,
      can_edit: perm.can_edit,
      can_delete: perm.can_delete,
    };
  });

  return {
    role: member.role,
    permissions: permissionsMap,
  };
}

/**
 * Check if user has permission for a module/action
 */
export async function hasPermission(
  userId: string,
  roofingCompanyId: string,
  module: Module,
  action: PermissionAction
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, roofingCompanyId);
  if (!permissions) {
    return false;
  }

  const modulePerms = permissions.permissions[module];
  if (!modulePerms) {
    return false;
  }

  switch (action) {
    case 'view':
      return modulePerms.can_view;
    case 'create':
      return modulePerms.can_create;
    case 'edit':
      return modulePerms.can_edit;
    case 'delete':
      return modulePerms.can_delete;
    default:
      return false;
  }
}

/**
 * Check if user can manage team
 */
export async function canManageTeam(
  userId: string,
  roofingCompanyId: string
): Promise<boolean> {
  return hasPermission(userId, roofingCompanyId, 'team', 'create') ||
         hasPermission(userId, roofingCompanyId, 'team', 'edit') ||
         hasPermission(userId, roofingCompanyId, 'team', 'delete');
}

/**
 * Check if user is owner or admin
 */
export async function isOwnerOrAdmin(
  userId: string,
  roofingCompanyId: string
): Promise<boolean> {
  const supabase = createClient();

  const { data: member } = await supabase
    .from("roofing_company_members")
    .select("role")
    .eq("roofing_company_id", roofingCompanyId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  return member?.role === 'owner' || member?.role === 'admin';
}

/**
 * Require permission or throw error (for API routes)
 */
export async function requirePermission(
  userId: string,
  roofingCompanyId: string,
  module: Module,
  action: PermissionAction
): Promise<void> {
  const hasPerm = await hasPermission(userId, roofingCompanyId, module, action);
  if (!hasPerm) {
    throw new Error(`Permission denied: ${action} on ${module}`);
  }
}

/**
 * Get modules user can access (for UI filtering)
 */
export async function getAccessibleModules(
  userId: string,
  roofingCompanyId: string
): Promise<Module[]> {
  const permissions = await getUserPermissions(userId, roofingCompanyId);
  if (!permissions) {
    return [];
  }

  const modules: Module[] = [];
  Object.keys(permissions.permissions).forEach((module) => {
    const perms = permissions.permissions[module as Module];
    if (perms && perms.can_view) {
      modules.push(module as Module);
    }
  });

  return modules;
}

























