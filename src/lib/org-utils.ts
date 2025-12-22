import { createClient } from "@supabase/supabase-js";
import { Role, canManageCampaigns, canInvite, canManageMembers } from "./auth/roles";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface OrgMembership {
  org_id: string;
  role: Role;
  org_name: string;
  seat_limit: number;
  current_members: number;
}

/**
 * Get user's organization membership
 */
export async function getUserOrgMembership(userId: string): Promise<OrgMembership | null> {
  try {
    const { data: membership, error } = await supabase
      .from("org_members")
      .select(`
        org_id,
        role,
        orgs (
          name,
          seat_limit
        )
      `)
      .eq("user_id", userId)
      .single();

    if (error || !membership) {
      return null;
    }

    // Get current member count
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", membership.org_id);

    return {
      org_id: membership.org_id,
      role: membership.role as Role,
      org_name: membership.orgs.name,
      seat_limit: membership.orgs.seat_limit || 1,
      current_members: count || 0,
    };
  } catch (error) {
    console.error("Error getting user org membership:", error);
    return null;
  }
}

/**
 * Check if user can perform an action based on their role
 */
export async function checkPermission(
  userId: string,
  orgId: string,
  action: "manage_campaigns" | "invite" | "manage_members" | "view_analytics"
): Promise<boolean> {
  try {
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .single();

    if (!membership) {
      return false;
    }

    const role = membership.role as Role;

    switch (action) {
      case "manage_campaigns":
        return canManageCampaigns(role);
      case "invite":
        return canInvite(role);
      case "manage_members":
        return canManageMembers(role);
      case "view_analytics":
        return role === "owner" || role === "admin" || role === "member";
      default:
        return false;
    }
  } catch (error) {
    console.error("Error checking permission:", error);
    return false;
  }
}

/**
 * Check if organization has available seats
 */
export async function hasAvailableSeats(orgId: string): Promise<boolean> {
  try {
    const { data: org } = await supabase
      .from("orgs")
      .select("seat_limit")
      .eq("id", orgId)
      .single();

    if (!org) {
      return false;
    }

    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    return (count || 0) < (org.seat_limit || 1);
  } catch (error) {
    console.error("Error checking available seats:", error);
    return false;
  }
}

/**
 * Get organization details
 */
export async function getOrgDetails(orgId: string) {
  try {
    const { data: org, error } = await supabase
      .from("orgs")
      .select(`
        id,
        name,
        seat_limit,
        stripe_subscription_id,
        created_at
      `)
      .eq("id", orgId)
      .single();

    if (error || !org) {
      return null;
    }

    // Get member count
    const { count } = await supabase
      .from("org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    return {
      ...org,
      current_members: count || 0,
      available_seats: Math.max(0, (org.seat_limit || 1) - (count || 0)),
    };
  } catch (error) {
    console.error("Error getting org details:", error);
    return null;
  }
} 