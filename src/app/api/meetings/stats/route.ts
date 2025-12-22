import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const workspaceId = await getCurrentWorkspaceId();
    
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const startDate = url.searchParams.get("start_date") || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = url.searchParams.get("end_date") || new Date().toISOString();

    // Get all meetings in date range
    const { data: meetings, error: meetingsError } = await supabase
      .from("meetings")
      .select("id, start_time, created_at, confidence, campaign_id, owner_id, deal_id")
      .eq("workspace_id", workspaceId)
      .gte("created_at", startDate)
      .lte("created_at", endDate);

    if (meetingsError) {
      return NextResponse.json({ error: meetingsError.message }, { status: 500 });
    }

    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const meetingsThisWeek = meetings?.filter(
      (m) => m.created_at && new Date(m.created_at) >= weekStart
    ).length || 0;

    const meetingsThisMonth = meetings?.filter(
      (m) => m.created_at && new Date(m.created_at) >= monthStart
    ).length || 0;

    // Get campaign breakdown
    const campaignMap = new Map<string, number>();
    meetings?.forEach((m) => {
      if (m.campaign_id) {
        campaignMap.set(m.campaign_id, (campaignMap.get(m.campaign_id) || 0) + 1);
      }
    });

    // Get owner breakdown
    const ownerMap = new Map<string, number>();
    meetings?.forEach((m) => {
      if (m.owner_id) {
        ownerMap.set(m.owner_id, (ownerMap.get(m.owner_id) || 0) + 1);
      }
    });

    // Calculate average confidence
    const avgConfidence = meetings && meetings.length > 0
      ? meetings.reduce((sum, m) => sum + (m.confidence || 0), 0) / meetings.length
      : 0;

    // Calculate meeting → deal conversion
    const meetingsWithDeals = meetings?.filter((m) => m.deal_id).length || 0;
    const meetingToDealConversion = meetings && meetings.length > 0
      ? (meetingsWithDeals / meetings.length) * 100
      : 0;

    // Calculate average time from reply → meeting (simplified)
    // This would ideally join with reply_threads to get actual reply time
    const avgTimeToMeeting = 0; // Placeholder

    return NextResponse.json({
      meetings_this_week: meetingsThisWeek,
      meetings_this_month: meetingsThisMonth,
      meetings_per_campaign: Object.fromEntries(campaignMap),
      meetings_by_owner: Object.fromEntries(ownerMap),
      meeting_to_deal_conversion: meetingToDealConversion,
      avg_meeting_confidence: avgConfidence,
      avg_time_reply_to_meeting: avgTimeToMeeting,
    });
  } catch (error: any) {
    console.error("Error fetching meeting stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch meeting stats" },
      { status: 500 }
    );
  }
}








