import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Calculate total MRR from org_usage_stats
    const { data: usageStats, error: statsError } = await supabaseAdmin
      .from("org_usage_stats")
      .select("mrr");

    if (statsError) {
      console.error("Error fetching usage stats:", statsError);
      return NextResponse.json({ error: "Failed to fetch MRR" }, { status: 500 });
    }

    const totalMrr = usageStats?.reduce((sum, stat) => sum + (Number(stat.mrr) || 0), 0) || 0;

    // Count upgrade suggestions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: upgrades, error: upgradesError } = await supabaseAdmin
      .from("pricing_actions")
      .select("id")
      .eq("action", "upgrade")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (upgradesError) {
      console.error("Error fetching upgrades:", upgradesError);
    }

    // Count discount offers (last 30 days)
    const { data: discounts, error: discountsError } = await supabaseAdmin
      .from("pricing_actions")
      .select("id")
      .eq("action", "discount")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (discountsError) {
      console.error("Error fetching discounts:", discountsError);
    }

    // Get pricing action trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentActions, error: recentError } = await supabaseAdmin
      .from("pricing_actions")
      .select("action, created_at")
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (recentError) {
      console.error("Error fetching recent actions:", recentError);
    }

    // Aggregate by action type
    const actionCounts = {
      keep: 0,
      upgrade: 0,
      discount: 0,
    };

    recentActions?.forEach((action) => {
      if (action.action in actionCounts) {
        actionCounts[action.action as keyof typeof actionCounts]++;
      }
    });

    return NextResponse.json({
      mrr: totalMrr,
      arr: totalMrr * 12,
      upgrades: upgrades?.length || 0,
      discounts: discounts?.length || 0,
      recentActions: actionCounts,
    });
  } catch (error) {
    console.error("Error in revenue-metrics API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

