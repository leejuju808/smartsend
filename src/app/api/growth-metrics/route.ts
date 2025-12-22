import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Growth Metrics API
 * Returns Q3 2026 growth sprint metrics for HQ dashboard
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: () => cookieStore }
    );

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query the growth_metrics_summary view
    const { data: metrics, error } = await supabase
      .from("growth_metrics_summary")
      .select("*")
      .single();

    if (error) {
      console.error("Error fetching growth metrics:", error);
      // Return default values if view doesn't exist yet
      return NextResponse.json({
        orgs: 0,
        signups: 0,
        arr: 0,
        subscriptions: 0,
        referrals_converted: 0,
        cac_payback: 0,
        last_updated: new Date().toISOString()
      });
    }

    // Format for HQ dashboard
    return NextResponse.json({
      orgs: metrics?.active_orgs || 0,
      signups: metrics?.monthly_signups || 0,
      arr: metrics?.arr || 0,
      subscriptions: metrics?.active_subscriptions || 0,
      referrals_converted: metrics?.referrals_converted || 0,
      cac_payback: metrics?.cac_payback_months || 0,
      last_updated: metrics?.last_updated || new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Growth metrics API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
