import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export type AccountRole = "owner" | "manager" | "staff";

export interface AccountRoleData {
  role: AccountRole;
  account_id: string;
  user_id: string;
  is_account_owner: boolean;
}

/**
 * Get the current user's account role and account_id
 * Checks both billing_accounts.user_id (account owner) and users table (team members)
 */
export async function getAccountRole(): Promise<AccountRoleData | null> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // First check if user is the account owner
  const { data: billingAccount } = await supabase
    .from("billing_accounts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (billingAccount) {
    return {
      role: "owner",
      account_id: billingAccount.id,
      user_id: user.id,
      is_account_owner: true,
    };
  }

  // Check if user is a team member
  const { data: teamMember } = await supabase
    .from("users")
    .select("account_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (teamMember) {
    return {
      role: teamMember.role as AccountRole,
      account_id: teamMember.account_id,
      user_id: user.id,
      is_account_owner: false,
    };
  }

  return null;
}

/**
 * Require user to have one of the specified roles
 */
export async function requireAccountRole(
  allowedRoles: AccountRole[]
): Promise<
  | { allowed: false; res: NextResponse }
  | { allowed: true; roleData: AccountRoleData }
> {
  const roleData = await getAccountRole();

  if (!roleData) {
    return {
      allowed: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!allowedRoles.includes(roleData.role)) {
    return {
      allowed: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { allowed: true, roleData };
}

/**
 * Check if user can perform a specific action based on role and account permissions
 */
export async function canPerformAction(
  action:
    | "send_campaign"
    | "edit_template"
    | "create_campaign"
    | "update_pipeline"
    | "view_revenue_dashboard"
    | "access_billing"
    | "invite_users"
): Promise<boolean> {
  const roleData = await getAccountRole();
  if (!roleData) return false;

  const supabase = createRouteHandlerClient({ cookies });

  // Get account permissions
  const { data: account } = await supabase
    .from("billing_accounts")
    .select("meta")
    .eq("id", roleData.account_id)
    .single();

  const permissions = account?.meta?.permissions || {};

  // Owner can do everything (except account-level actions are restricted to account owner)
  if (roleData.role === "owner") {
    if (action === "access_billing" || action === "invite_users") {
      return roleData.is_account_owner;
    }
    return true;
  }

  // Check action-specific permissions
  switch (action) {
    case "send_campaign":
      if (roleData.role === "manager") {
        return permissions.manager_can_send === true;
      }
      return false;

    case "edit_template":
    case "create_campaign":
      return roleData.role === "manager";

    case "update_pipeline":
      if (roleData.role === "staff") {
        return permissions.staff_can_update_pipeline !== false; // default true
      }
      return true;

    case "view_revenue_dashboard":
      // Staff cannot see revenue dashboard
      if (roleData.role === "staff") {
        return false;
      }
      return roleData.role === "owner" || roleData.role === "manager";

    case "access_billing":
    case "invite_users":
      return false; // Only owners can do these

    default:
      return false;
  }
}

/**
 * Require user to be able to perform a specific action
 */
export async function requireAction(
  action:
    | "send_campaign"
    | "edit_template"
    | "create_campaign"
    | "update_pipeline"
    | "view_revenue_dashboard"
    | "access_billing"
    | "invite_users"
): Promise<
  | { allowed: false; res: NextResponse }
  | { allowed: true; roleData: AccountRoleData }
> {
  const roleData = await getAccountRole();

  if (!roleData) {
    return {
      allowed: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const canPerform = await canPerformAction(action);

  if (!canPerform) {
    return {
      allowed: false,
      res: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { allowed: true, roleData };
}




