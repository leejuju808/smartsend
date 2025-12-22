/**
 * Block 20870 — Session Guard Utilities
 * Server-side session context and role enforcement
 */

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export type RoofingTeamRole = "OWNER" | "SALES_REP" | "OFFICE_STAFF" | "ADJUSTER_HELPER";

export interface SessionContext {
  user_id: string;
  organization_id: string;
  role: RoofingTeamRole;
  email: string;
}

/**
 * Get current user's session context from database
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return null;
    }

    // Get session context from database function
    const { data, error } = await supabase.rpc("get_session_context");

    if (error || !data || data.length === 0) {
      return null;
    }

    const context = data[0];
    if (!context.organization_id || !context.role) {
      return null;
    }

    return {
      user_id: context.user_id,
      organization_id: context.organization_id,
      role: context.role as RoofingTeamRole,
      email: context.email || user.email || "",
    };
  } catch (error) {
    console.error("Error getting session context:", error);
    return null;
  }
}

/**
 * Require authenticated session with organization
 */
export async function requireSession(): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const context = await getSessionContext();

  if (!context) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      ),
    };
  }

  if (!context.organization_id) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "No organization found. Please contact support." },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, context };
}

/**
 * Require specific role(s)
 */
export async function requireRole(
  allowedRoles: RoofingTeamRole[]
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const sessionResult = await requireSession();
  if (!sessionResult.allowed) {
    return sessionResult;
  }

  const { context } = sessionResult;
  if (!allowedRoles.includes(context.role)) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
          your_role: context.role,
        },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, context };
}

/**
 * Check if user has permission for a specific action
 */
export function hasPermission(
  role: RoofingTeamRole,
  action: string
): boolean {
  const permissions: Record<RoofingTeamRole, string[]> = {
    OWNER: [
      "send_proposal",
      "send_adjuster_email",
      "update_job_stage",
      "view_all_leads",
      "edit_pricing",
      "manage_team",
      "manage_billing",
      "view_revenue_dashboard",
    ],
    SALES_REP: [
      "send_proposal", // Only on assigned leads
      "update_job_stage", // Only on assigned jobs
      "view_assigned_leads",
      "send_homeowner_email",
    ],
    OFFICE_STAFF: [
      "view_all_leads",
      "send_homeowner_email",
      "update_scheduling_stages",
      "view_calendar",
    ],
    ADJUSTER_HELPER: [
      "view_claim_leads",
      "draft_adjuster_email", // Can draft but not send
      "view_insurance_data",
    ],
  };

  return permissions[role]?.includes(action) || false;
}

/**
 * Check if user can perform action on a specific resource
 */
export async function canPerformAction(
  action: string,
  resourceId?: string,
  resourceType?: "lead" | "job" | "thread"
): Promise<boolean> {
  const context = await getSessionContext();
  if (!context) {
    return false;
  }

  // Check basic permission
  if (!hasPermission(context.role, action)) {
    return false;
  }

  // For SALES_REP, check assignment
  if (context.role === "SALES_REP" && resourceId) {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    if (resourceType === "lead") {
      const { data } = await supabase
        .from("leads")
        .select("assigned_user_id")
        .eq("id", resourceId)
        .single();

      return data?.assigned_user_id === context.user_id;
    }

    if (resourceType === "job") {
      const { data } = await supabase
        .from("roofing_jobs")
        .select("assigned_user_id")
        .eq("id", resourceId)
        .single();

      return data?.assigned_user_id === context.user_id;
    }
  }

  return true;
}

/**
 * Middleware wrapper for route protection
 */
export function withSessionGuard(
  handler: (req: NextRequest, context: SessionContext) => Promise<NextResponse>,
  options?: {
    requiredRoles?: RoofingTeamRole[];
    requiredPermission?: string;
  }
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Check session
    const sessionResult = await requireSession();
    if (!sessionResult.allowed) {
      return sessionResult.response;
    }

    const { context } = sessionResult;

    // Check role if specified
    if (options?.requiredRoles) {
      if (!options.requiredRoles.includes(context.role)) {
        return NextResponse.json(
          {
            error: "Forbidden",
            message: `This endpoint requires one of these roles: ${options.requiredRoles.join(", ")}`,
          },
          { status: 403 }
        );
      }
    }

    // Check permission if specified
    if (options?.requiredPermission) {
      if (!hasPermission(context.role, options.requiredPermission)) {
        return NextResponse.json(
          {
            error: "Forbidden",
            message: `This action requires permission: ${options.requiredPermission}`,
          },
          { status: 403 }
        );
      }
    }

    return handler(req, context);
  };
}
















































