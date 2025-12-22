/**
 * Example Protected API Route
 * Demonstrates how to use Block 20870 session guards
 */

import { NextRequest, NextResponse } from "next/server";
import { guardOutboundEmail, guardAdjusterEmail } from "@/lib/auth/route-guards";
import { requireRole } from "@/lib/auth/session-guard";

/**
 * Example: Protected route that requires OWNER or SALES_REP role
 */
export async function GET(req: NextRequest) {
  // Method 1: Use requireRole helper
  const result = await requireRole(["OWNER", "SALES_REP"]);
  if (!result.allowed) {
    return result.response;
  }

  const { context } = result;
  
  // Now you have access to:
  // - context.user_id
  // - context.organization_id
  // - context.role
  // - context.email

  return NextResponse.json({
    message: "Success",
    user_id: context.user_id,
    organization_id: context.organization_id,
    role: context.role,
  });
}

/**
 * Example: Protected route for sending outbound emails
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { lead_id } = body;

  // Method 2: Use specific route guard
  const guardResult = await guardOutboundEmail(req, lead_id);
  if (!guardResult.allowed) {
    return guardResult.response;
  }

  const { context } = guardResult;

  // Proceed with sending email...
  // All checks passed:
  // - User is authenticated
  // - User has organization
  // - User has correct role (not ADJUSTER_HELPER)
  // - If SALES_REP, lead is assigned to them

  return NextResponse.json({
    success: true,
    message: "Email sent",
  });
}

/**
 * Example: Protected route for adjuster emails
 */
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { action } = body; // "send" or "draft"

  // Method 3: Use guard with action parameter
  const guardResult = await guardAdjusterEmail(req, action as "send" | "draft");
  if (!guardResult.allowed) {
    return guardResult.response;
  }

  const { context } = guardResult;

  // Proceed with adjuster email...
  // Checks passed:
  // - If action="send": Only OWNER allowed
  // - If action="draft": OWNER or ADJUSTER_HELPER allowed

  return NextResponse.json({
    success: true,
    message: action === "send" ? "Adjuster email sent" : "Draft saved",
  });
}
















































