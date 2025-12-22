/**
 * Storm-Driven Revenue Analytics
 * GET /api/storm/analytics/revenue
 * Returns storm-driven revenue metrics for the last 30 days
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

/**
 * GET /api/storm/analytics/revenue
 * Get storm-driven revenue analytics
 * Query params: days (default 30)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30");

    // Get storm-driven revenue from view
    const { data: revenueData, error } = await supabase
      .from("storm_driven_revenue")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("storm_date", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order("storm_date", { ascending: false });

    if (error) {
      console.error("Error fetching storm revenue analytics:", error);
      return NextResponse.json(
        { error: "Failed to fetch storm revenue analytics" },
        { status: 500 }
      );
    }

    // Calculate totals
    const totals = {
      total_pipeline_value: 0,
      total_revenue_closed: 0,
      total_replacements_closed: 0,
      total_estimates_booked: 0,
      total_emergency_repairs: 0,
      total_storm_leads: 0,
    };

    (revenueData || []).forEach((day) => {
      totals.total_pipeline_value += Number(day.pipeline_value || 0);
      totals.total_revenue_closed += Number(day.revenue_closed || 0);
      totals.total_replacements_closed += Number(day.replacements_closed || 0);
      totals.total_estimates_booked += Number(day.estimates_booked || 0);
      totals.total_emergency_repairs += Number(day.emergency_repairs || 0);
      totals.total_storm_leads += Number(day.total_storm_leads || 0);
    });

    return NextResponse.json({
      period_days: days,
      daily_breakdown: revenueData || [],
      totals,
    });
  } catch (error) {
    console.error("Error in /api/storm/analytics/revenue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































