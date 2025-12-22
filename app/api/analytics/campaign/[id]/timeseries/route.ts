import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get("days") ?? "30")));

    // Verify user has access to this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Check workspace membership
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get time series data from email_events
    const { data, error } = await supabase
      .from("email_events")
      .select("event_type, created_at")
      .eq("campaign_id", campaignId)
      .gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by date and event type
    const dailyData: Record<string, {
      date: string;
      sent: number;
      opens: number;
      clicks: number;
      replies: number;
      bounces: number;
    }> = {};

    (data || []).forEach((event) => {
      const date = new Date(event.created_at).toISOString().split("T")[0];
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          sent: 0,
          opens: 0,
          clicks: 0,
          replies: 0,
          bounces: 0,
        };
      }

      if (event.event_type === "sent") {
        dailyData[date].sent++;
      } else if (event.event_type === "open") {
        dailyData[date].opens++;
      } else if (event.event_type === "click") {
        dailyData[date].clicks++;
      } else if (event.event_type === "reply") {
        dailyData[date].replies++;
      } else if (event.event_type === "bounce") {
        dailyData[date].bounces++;
      }
    });

    const result = Object.values(dailyData).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}



