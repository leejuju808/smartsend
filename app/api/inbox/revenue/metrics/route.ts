import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/metrics
 * Fetch revenue metrics for the inbox header panel
 * Returns: today_revenue, week_revenue, month_revenue, active_leads_count, hot_lead_value
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

    // Call the database function
    const { data, error } = await supabase
      .rpc("get_inbox_revenue_metrics", { p_campaign_id: campaignId })
      .single();

    if (error) {
      console.error("Error fetching revenue metrics:", error);
      return NextResponse.json(
        { error: "Failed to fetch revenue metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      today_revenue: Number(data?.today_revenue || 0),
      week_revenue: Number(data?.week_revenue || 0),
      month_revenue: Number(data?.month_revenue || 0),
      active_leads_count: Number(data?.active_leads_count || 0),
      hot_lead_value: Number(data?.hot_lead_value || 0),
    });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































