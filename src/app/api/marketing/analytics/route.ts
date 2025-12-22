/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Marketing Analytics API
 * 
 * GET /api/marketing/analytics - Get marketing campaign analytics
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const campaignId = searchParams.get("campaign_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Build analytics query
    let query = supabase
      .from("marketing_analytics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("date", { ascending: false });

    if (campaignId) {
      query = query.eq("campaign_id", campaignId);
    }

    if (startDate) {
      query = query.gte("date", startDate);
    }

    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data: analytics, error } = await query;

    if (error) {
      console.error("Error fetching analytics:", error);
      return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
    }

    // Calculate summary metrics
    const summary = analytics?.reduce(
      (acc: any, day: any) => ({
        recipients: acc.recipients + (day.recipients || 0),
        sent: acc.sent + (day.sent || 0),
        opened: acc.opened + (day.opened || 0),
        clicked: acc.clicked + (day.clicked || 0),
        replied: acc.replied + (day.replied || 0),
        booked: acc.booked + (day.booked || 0),
        revenue: acc.revenue + parseFloat(day.revenue || 0),
        unsubscribed: acc.unsubscribed + (day.unsubscribed || 0),
      }),
      {
        recipients: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        booked: 0,
        revenue: 0,
        unsubscribed: 0,
      }
    ) || {
      recipients: 0,
      sent: 0,
      opened: 0,
      clicked: 0,
      replied: 0,
      booked: 0,
      revenue: 0,
      unsubscribed: 0,
    };

    // Calculate rates
    summary.open_rate = summary.sent > 0 ? (summary.opened / summary.sent) * 100 : 0;
    summary.click_rate = summary.sent > 0 ? (summary.clicked / summary.sent) * 100 : 0;
    summary.reply_rate = summary.sent > 0 ? (summary.replied / summary.sent) * 100 : 0;
    summary.booking_rate = summary.sent > 0 ? (summary.booked / summary.sent) * 100 : 0;
    summary.unsubscribe_rate = summary.sent > 0 ? (summary.unsubscribed / summary.sent) * 100 : 0;

    return NextResponse.json({
      analytics,
      summary,
    });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/analytics:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































