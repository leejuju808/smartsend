import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getUsageStats } from "@/lib/billing/guard-v2";

/**
 * GET /api/billing/limits
 * Get current plan limits and usage
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stats = await getUsageStats(supabase, user.id);

    if (!stats) {
      return NextResponse.json({ error: "Unable to fetch usage stats" }, { status: 500 });
    }

    return NextResponse.json({
      plan: stats.plan,
      limits: {
        maxCampaigns: stats.limits.maxActiveCampaigns,
        maxEmailsPerMonth: stats.limits.monthlyEmailLimit,
      },
      usage: {
        campaignsCreated: stats.campaignsCreated,
        emailsSentThisMonth: stats.emailsSentThisMonth,
      },
      remaining: {
        campaigns: stats.limits.maxActiveCampaigns 
          ? Math.max(0, stats.limits.maxActiveCampaigns - stats.campaignsCreated)
          : null,
        emails: stats.limits.monthlyEmailLimit
          ? Math.max(0, stats.limits.monthlyEmailLimit - stats.emailsSentThisMonth)
          : null,
      },
    });
  } catch (error: any) {
    console.error("[Billing Limits API]", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































