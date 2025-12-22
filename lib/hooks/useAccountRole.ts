import { useEffect, useState } from "react";

export type AccountRole = "owner" | "manager" | "staff" | null;

export interface AccountRoleData {
  role: AccountRole;
  account_id: string | null;
  is_account_owner: boolean;
}

/**
 * Hook to get the current user's account role
 */
export function useAccountRole() {
  const [roleData, setRoleData] = useState<AccountRoleData>({
    role: null,
    account_id: null,
    is_account_owner: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      try {
        const response = await fetch("/api/settings/team/me");
        if (response.ok) {
          const data = await response.json();
          setRoleData({
            role: data.role,
            account_id: data.account_id,
            is_account_owner: data.is_account_owner,
          });
        }
      } catch (error) {
        console.error("Error fetching account role:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchRole();
  }, []);

  return { ...roleData, loading };
}

/**
 * Check if user can perform an action based on role
 */
export function canPerformAction(
  role: AccountRole,
  action: string
): boolean {
  if (role === "owner") {
    // Owner can do everything except remove themselves
    return action !== "remove_owner";
  }

  if (role === "manager") {
    // Manager can do most things except billing/account management
    return ![
      "access_billing",
      "delete_account",
      "remove_owner",
      "change_sending_domain",
    ].includes(action);
  }

  if (role === "staff") {
    // Staff can only do limited actions
    return [
      "view_assigned_leads",
      "add_notes",
      "complete_task",
      "schedule_appointment",
      "respond_to_messages",
      "view_assigned_inbox",
    ].includes(action);
  }

  return false;
}

/**
 * Check if user can view a specific feature
 * For 'inbox' feature, also checks beta_access_level via inbox access check
 */
export function canViewFeature(role: AccountRole, feature: string): boolean {
  // For inbox, we need to check beta access level separately
  // This is a synchronous check, so we'll do a basic role check here
  // The actual inbox access check happens in components via useInboxAccess hook
  if (feature === "inbox") {
    // Basic role check - actual inbox access is checked via useInboxAccess hook
    // This prevents showing inbox to users without proper role
    if (role === null) return false;
    // Role check passes, but actual access is gated by beta_access_level
    return true; // Will be filtered by useInboxAccess in components
  }

  if (role === "owner") {
    return true; // Owner can see everything (except inbox which is gated separately)
  }

  if (role === "manager") {
    // Managers can see everything except billing
    return feature !== "billing";
  }

  if (role === "staff") {
    // Staff can only see: inbox, contacts (assigned), tasks, scheduler
    return [
      "inbox",
      "contacts",
      "tasks",
      "scheduler",
      "pipeline", // Read-only
    ].includes(feature);
  }

  return false;
}



