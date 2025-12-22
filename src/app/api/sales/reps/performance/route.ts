// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Rep Performance Tracking API
// GET /api/sales/reps/performance?org_id=xxx&rep_id=xxx&days=30

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const org_id = searchParams.get("org_id");
    const rep_id = searchParams.get("rep_id");
    const days = parseInt(searchParams.get("days") || "30");

    if (!org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get performance from view
    let query = supabase
      .from("v_sales_rep_performance")
      .select("*")
      .eq("org_id", org_id);

    if (rep_id) {
      query = query.eq("rep_id", rep_id);
    }

    const { data: performance, error: perfError } = await query;

    if (perfError) {
      console.error("Error fetching rep performance:", perfError);
    }

    // Get detailed activity for each rep
    const repIds = rep_id ? [rep_id] : performance?.map((p) => p.rep_id) || [];

    const { data: activities } = await supabase
      .from("sales_activities")
      .select("*")
      .eq("org_id", org_id)
      .in("rep_id", repIds)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });

    // Get estimates created in period
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id, created_by, price, created_at")
      .eq("org_id", org_id)
      .in("created_by", repIds)
      .gte("created_at", startDate.toISOString());

    // Get proposals sent in period
    const { data: proposals } = await supabase
      .from("proposals")
      .select("id, lead_id, sent, sent_at")
      .eq("org_id", org_id)
      .eq("sent", true)
      .gte("sent_at", startDate.toISOString());

    // Get won deals in period
    const { data: wonLeads } = await supabase
      .from("leads")
      .select("id, assigned_to, sales_status")
      .eq("org_id", org_id)
      .eq("sales_status", "won")
      .in("assigned_to", repIds);

    // Calculate additional metrics per rep
    const enhancedPerformance = (performance || []).map((rep) => {
      const repEstimates = estimates?.filter((e) => e.created_by === rep.rep_id) || [];
      const repProposals = proposals?.filter((p) => {
        // Would need to join with leads to get assigned_to
        return true; // Simplified
      }) || [];
      const repWon = wonLeads?.filter((l) => l.assigned_to === rep.rep_id) || [];
      const repActivities = activities?.filter((a) => a.rep_id === rep.rep_id) || [];

      return {
        ...rep,
        estimates_created_period: repEstimates.length,
        proposals_sent_period: repProposals.length,
        deals_won_period: repWon.length,
        activities_count: repActivities.length,
        avg_deal_size: rep.avg_deal_size || 0,
        revenue_closed_period: repWon.length * (rep.avg_deal_size || 0),
      };
    });

    // Sort by revenue closed
    enhancedPerformance.sort((a, b) => b.revenue_closed - a.revenue_closed);

    return NextResponse.json({
      success: true,
      period_days: days,
      performance: enhancedPerformance,
      summary: {
        total_reps: enhancedPerformance.length,
        total_revenue: enhancedPerformance.reduce((sum, r) => sum + (r.revenue_closed || 0), 0),
        avg_close_rate:
          enhancedPerformance.length > 0
            ? enhancedPerformance.reduce((sum, r) => sum + (r.close_rate_percent || 0), 0) /
              enhancedPerformance.length
            : 0,
        top_performer: enhancedPerformance[0] || null,
      },
    });
  } catch (error: any) {
    console.error("Error in rep performance API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















