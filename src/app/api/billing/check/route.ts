import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { checkBillingGuard, type BillingAction } from "@/lib/billing/guard-v2";

/**
 * POST /api/billing/check
 * Check if a billing-guarded action is allowed
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, metadata } = body as {
      action: BillingAction;
      metadata?: {
        emailsToSend?: number;
        campaignId?: string;
      };
    };

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const result = await checkBillingGuard(supabase, user.id, action, metadata);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Billing Check API]", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































