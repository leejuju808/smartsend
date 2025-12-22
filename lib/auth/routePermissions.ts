/**
 * Route Permission Helper for Block 12100
 * Maps routes to required permissions/roles
 */

import { AccountRole } from "./requireAccountRole";

export type RoutePermission = 
  | "view_inbox"
  | "reply_to_leads"
  | "update_lead_status"
  | "view_timeline"
  | "view_assigned_lists"
  | "view_hot_leads"
  | "view_warm_leads"
  | "view_follow_ups"
  | "create_campaign"
  | "edit_campaign"
  | "delete_campaign"
  | "import_leads"
  | "assign_tags"
  | "manage_lead_statuses"
  | "view_dashboard"
  | "view_roi"
  | "view_activity_log"
  | "edit_template"
  | "view_templates"
  | "access_billing"
  | "invite_users"
  | "remove_member"
  | "change_role"
  | "access_settings"
  | "modify_domain";

/**
 * Check if a role has permission for a route/action
 */
export function hasRoutePermission(
  role: AccountRole,
  permission: RoutePermission
): boolean {
  // Owner: Full access (except billing/account deletion)
  if (role === "owner") {
    return permission !== "access_billing" || true; // Owners can access billing
  }

  // Manager: Campaigns, leads, dashboard, templates
  if (role === "manager") {
    return [
      "view_inbox",
      "reply_to_leads",
      "manage_lead_statuses",
      "view_dashboard",
      "view_roi",
      "view_timeline",
      "view_activity_log",
      "create_campaign",
      "edit_campaign",
      "delete_campaign",
      "import_leads",
      "assign_tags",
      "edit_template",
      "view_templates",
      "view_hot_leads",
      "view_warm_leads",
      "view_follow_ups",
    ].includes(permission);
  }

  // Staff: Limited to inbox, replies, lead status, timeline
  if (role === "staff") {
    return [
      "view_inbox",
      "reply_to_leads",
      "update_lead_status",
      "view_timeline",
      "view_assigned_lists",
      "view_hot_leads",
      "view_warm_leads",
      "view_follow_ups",
    ].includes(permission);
  }

  return false;
}

/**
 * Get allowed routes for a role
 */
export function getAllowedRoutes(role: AccountRole): RoutePermission[] {
  const allRoutes: RoutePermission[] = [
    "view_inbox",
    "reply_to_leads",
    "update_lead_status",
    "view_timeline",
    "view_assigned_lists",
    "view_hot_leads",
    "view_warm_leads",
    "view_follow_ups",
    "create_campaign",
    "edit_campaign",
    "delete_campaign",
    "import_leads",
    "assign_tags",
    "manage_lead_statuses",
    "view_dashboard",
    "view_roi",
    "view_activity_log",
    "edit_template",
    "view_templates",
    "access_billing",
    "invite_users",
    "remove_member",
    "change_role",
    "access_settings",
    "modify_domain",
  ];

  return allRoutes.filter((route) => hasRoutePermission(role, route));
}

/**
 * Map route paths to permissions
 */
export const ROUTE_PERMISSIONS: Record<string, RoutePermission[]> = {
  "/dashboard": ["view_dashboard"],
  "/dashboard/inbox": ["view_inbox"],
  "/dashboard/campaigns": ["view_dashboard"],
  "/dashboard/campaigns/new": ["create_campaign"],
  "/dashboard/campaigns/[id]/edit": ["edit_campaign"],
  "/dashboard/leads": ["view_assigned_lists"],
  "/dashboard/leads/hot": ["view_hot_leads"],
  "/dashboard/leads/warm": ["view_warm_leads"],
  "/dashboard/leads/follow-ups": ["view_follow_ups"],
  "/dashboard/timeline": ["view_timeline"],
  "/dashboard/activity": ["view_activity_log"],
  "/dashboard/templates": ["view_templates"],
  "/dashboard/templates/[id]/edit": ["edit_template"],
  "/settings": ["access_settings"],
  "/settings/team": ["invite_users"],
  "/settings/billing": ["access_billing"],
  "/settings/domain": ["modify_domain"],
};

/**
 * Check if user can access a route
 */
export function canAccessRoute(
  role: AccountRole,
  pathname: string
): boolean {
  // Find matching route pattern
  for (const [pattern, permissions] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === pattern || pathname.startsWith(pattern + "/")) {
      return permissions.some((perm) => hasRoutePermission(role, perm));
    }
  }

  // Default: allow if authenticated (fallback)
  return true;
}





















































