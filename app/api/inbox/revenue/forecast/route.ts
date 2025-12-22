import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/forecast
 * Fetch revenue forecast (30 days, best case, worst case)
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
    const daysAhead = parseInt(searchParams.get("days_ahead") || "30", 10);

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

    // Call the forecast function
    const { data, error } = await supabase
      .rpc("calculate_revenue_forecast", {
        p_campaign_id: campaignId,
        p_days_ahead: daysAhead,
      })
      .single();

    if (error) {
      console.error("Error calculating forecast:", error);
      return NextResponse.json(
        { error: "Failed to calculate forecast" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      forecasted_revenue: Number(data?.forecasted_revenue || 0),
      best_case_revenue: Number(data?.best_case_revenue || 0),
      worst_case_revenue: Number(data?.worst_case_revenue || 0),
      thread_count: Number(data?.thread_count || 0),
      days_ahead: daysAhead,
    });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/forecast:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































