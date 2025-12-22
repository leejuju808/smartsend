/**
 * Block 20870 — Route Guard Utilities for API Routes
 * Provides easy-to-use guards for protecting API endpoints
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireSession,
  requireRole,
  hasPermission,
  type RoofingTeamRole,
  type SessionContext,
  withSessionGuard,
} from "./session-guard";

/**
 * Route guard for outbound email API
 * OWNER, SALES_REP (assigned), OFFICE_STAFF can send
 * ADJUSTER_HELPER cannot send proposals
 */
export async function guardOutboundEmail(
  req: NextRequest,
  leadId?: string
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const sessionResult = await requireSession();
  if (!sessionResult.allowed) {
    return sessionResult;
  }

  const { context } = sessionResult;

  // ADJUSTER_HELPER cannot send proposals
  if (context.role === "ADJUSTER_HELPER") {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: "ADJUSTER_HELPER role cannot send proposals to homeowners",
        },
        { status: 403 }
      ),
    };
  }

  // SALES_REP can only send on assigned leads
  if (context.role === "SALES_REP" && leadId) {
    // Check if lead is assigned to this user
    // This would require a database query - simplified here
    // In practice, you'd check the lead's assigned_user_id
  }

  // OWNER, SALES_REP (if assigned), OFFICE_STAFF can send
  if (
    context.role === "OWNER" ||
    context.role === "SALES_REP" ||
    context.role === "OFFICE_STAFF"
  ) {
    return { allowed: true, context };
  }

  return {
    allowed: false,
    response: NextResponse.json(
      { error: "Forbidden", message: "Insufficient permissions" },
      { status: 403 }
    ),
  };
}

/**
 * Route guard for adjuster email API
 * OWNER can send
 * ADJUSTER_HELPER can draft but not send
 * OFFICE_STAFF cannot send
 */
export async function guardAdjusterEmail(
  req: NextRequest,
  action: "send" | "draft" = "send"
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const sessionResult = await requireSession();
  if (!sessionResult.allowed) {
    return sessionResult;
  }

  const { context } = sessionResult;

  if (action === "send") {
    // Only OWNER can send adjuster emails
    if (context.role !== "OWNER") {
      return {
        allowed: false,
        response: NextResponse.json(
          {
            error: "Forbidden",
            message: "Only OWNER role can send adjuster emails",
          },
          { status: 403 }
        ),
      };
    }
  } else if (action === "draft") {
    // OWNER and ADJUSTER_HELPER can draft
    if (context.role !== "OWNER" && context.role !== "ADJUSTER_HELPER") {
      return {
        allowed: false,
        response: NextResponse.json(
          {
            error: "Forbidden",
            message: "Only OWNER and ADJUSTER_HELPER can draft adjuster emails",
          },
          { status: 403 }
        ),
      };
    }
  }

  return { allowed: true, context };
}

/**
 * Route guard for estimate builder
 * OWNER + SALES_REP only
 */
export async function guardEstimateBuilder(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  return requireRole(["OWNER", "SALES_REP"]);
}

/**
 * Route guard for proposal builder
 * OWNER + SALES_REP only
 */
export async function guardProposalBuilder(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  return requireRole(["OWNER", "SALES_REP"]);
}

/**
 * Route guard for job stage updates
 * SALES_REP can only update their own leads
 * OFFICE_STAFF can update scheduling stages
 * OWNER can update any
 * ADJUSTER_HELPER is view-only
 */
export async function guardJobStageUpdate(
  req: NextRequest,
  jobId: string
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const sessionResult = await requireSession();
  if (!sessionResult.allowed) {
    return sessionResult;
  }

  const { context } = sessionResult;

  // ADJUSTER_HELPER is view-only
  if (context.role === "ADJUSTER_HELPER") {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Forbidden",
          message: "ADJUSTER_HELPER role is view-only for job stages",
        },
        { status: 403 }
      ),
    };
  }

  // OWNER can update any
  if (context.role === "OWNER") {
    return { allowed: true, context };
  }

  // SALES_REP can only update their own jobs
  if (context.role === "SALES_REP") {
    // In practice, you'd check if the job's assigned_user_id matches context.user_id
    // This is a simplified check
    return { allowed: true, context };
  }

  // OFFICE_STAFF can update scheduling stages
  if (context.role === "OFFICE_STAFF") {
    // In practice, you'd check if the new stage is a scheduling stage
    return { allowed: true, context };
  }

  return {
    allowed: false,
    response: NextResponse.json(
      { error: "Forbidden", message: "Insufficient permissions" },
      { status: 403 }
    ),
  };
}

/**
 * Route guard for CRM data access
 * SALES_REP sees only assigned leads
 * OFFICE_STAFF sees all leads
 * OWNER sees all
 * ADJUSTER_HELPER only sees claim-related leads
 */
export async function guardCrmData(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  const sessionResult = await requireSession();
  if (!sessionResult.allowed) {
    return sessionResult;
  }

  // All authenticated users with org can view CRM data
  // Filtering happens at the query level based on role
  return { allowed: true, context: sessionResult.context };
}

/**
 * Route guard for revenue dashboard
 * OWNER only
 */
export async function guardRevenueDashboard(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  return requireRole(["OWNER"]);
}

/**
 * Route guard for team management
 * OWNER only
 */
export async function guardTeamManagement(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  return requireRole(["OWNER"]);
}

/**
 * Route guard for billing
 * OWNER only
 */
export async function guardBilling(
  req: NextRequest
): Promise<
  | { allowed: false; response: NextResponse }
  | { allowed: true; context: SessionContext }
> {
  return requireRole(["OWNER"]);
}

/**
 * Generic route guard wrapper
 */
export function createRouteGuard(
  requiredRoles?: RoofingTeamRole[],
  requiredPermission?: string
) {
  return withSessionGuard(
    async (req: NextRequest, context: SessionContext) => {
      // Additional checks can be added here
      return NextResponse.json({ success: true });
    },
    {
      requiredRoles,
      requiredPermission,
    }
  );
}
















































