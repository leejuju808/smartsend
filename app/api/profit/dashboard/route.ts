// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// API Route: /api/profit/dashboard
// Get dashboard data: job profit cards, underbid alerts, upsell tracker, heatmap

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const teamId = searchParams.get("team_id");

    if (!teamId) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    // Get job profit cards
    const { data: profitAnalysis } = await supabase
      .from("profit_analysis")
      .select(`
        *,
        jobs (
          id,
          contract_value,
          stage,
          created_at
        )
      `)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get underbid alerts
    const { data: underbids } = await supabase
      .from("underbid_detections")
      .select(`
        *,
        jobs (
          id,
          contract_value,
          stage
        )
      `)
      .eq("team_id", teamId)
      .eq("status", "detected")
      .order("created_at", { ascending: false })
      .limit(10);

    // Get upsell revenue tracker
    const { data: upsells } = await supabase
      .from("upsell_suggestions")
      .select("*")
      .eq("team_id", teamId)
      .in("status", ["accepted", "presented"])
      .order("created_at", { ascending: false });

    // Calculate upsell metrics
    const totalUpsellRevenue = upsells?.reduce(
      (sum, u) => sum + (u.estimated_revenue || 0),
      0
    ) || 0;

    const acceptedUpsells = upsells?.filter((u) => u.status === "accepted") || [];
    const acceptedRevenue = acceptedUpsells.reduce(
      (sum, u) => sum + (u.estimated_revenue || 0),
      0
    );

    // Get most accepted upsells
    const upsellCounts: Record<string, number> = {};
    acceptedUpsells.forEach((u) => {
      upsellCounts[u.suggestion] = (upsellCounts[u.suggestion] || 0) + 1;
    });
    const mostAcceptedUpsells = Object.entries(upsellCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([suggestion, count]) => ({ suggestion, count }));

    // Get profit heatmap data (by crew)
    const { data: crewProfitData } = await supabase
      .from("profit_analysis")
      .select(`
        actual_profit,
        margin_percent,
        jobs!inner (
          crew_name
        )
      `)
      .eq("team_id", teamId)
      .not("jobs.crew_name", "is", null);

    // Group by crew
    const crewPerformance: Record<string, { profit: number; margin: number; count: number }> = {};
    crewProfitData?.forEach((item: any) => {
      const crewName = item.jobs?.crew_name || "Unknown";
      if (!crewPerformance[crewName]) {
        crewPerformance[crewName] = { profit: 0, margin: 0, count: 0 };
      }
      crewPerformance[crewName].profit += item.actual_profit || 0;
      crewPerformance[crewName].margin += item.margin_percent || 0;
      crewPerformance[crewName].count += 1;
    });

    // Calculate averages
    const crewHeatmap = Object.entries(crewPerformance).map(([crew, data]) => ({
      crew,
      avg_profit: data.profit / data.count,
      avg_margin: data.margin / data.count,
      job_count: data.count,
    }));

    return NextResponse.json({
      success: true,
      job_profit_cards: profitAnalysis || [],
      underbid_alerts: underbids || [],
      upsell_tracker: {
        total_revenue: totalUpsellRevenue,
        accepted_revenue: acceptedRevenue,
        most_accepted: mostAcceptedUpsells,
        total_count: upsells?.length || 0,
        accepted_count: acceptedUpsells.length,
      },
      profit_heatmap: crewHeatmap,
    });
  } catch (error: any) {
    console.error("Error in profit dashboard API:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





























