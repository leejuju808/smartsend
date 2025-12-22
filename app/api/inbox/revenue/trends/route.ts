import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/trends
 * Fetch weekly revenue trends (daily breakdown)
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

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Verify user can access this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get trends from view (last N days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { data, error } = await supabase
      .from("inbox_weekly_revenue_trends")
      .select("*")
      .eq("campaign_id", campaignId)
      .gte("date", cutoffDate.toISOString())
      .order("date", { ascending: true });

    if (error) {
      console.error("Error fetching trends:", error);
      return NextResponse.json(
        { error: "Failed to fetch trends" },
        { status: 500 }
      );
    }

    // Format response
    const trends = (data || []).map((row) => ({
      date: row.date,
      jobs_closed_count: Number(row.jobs_closed_count || 0),
      revenue_booked: Number(row.revenue_booked || 0),
      estimates_booked_count: Number(row.estimates_booked_count || 0),
      estimate_value: Number(row.estimate_value || 0),
    }));

    return NextResponse.json({ trends });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/trends:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































