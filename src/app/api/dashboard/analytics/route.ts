import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;
    
    const supabase = getServerSupabase();
    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : null;

    // Get workspace_id from gate
    const workspace_id = gate.workspace_id;

    // Calculate date filter
    let dateFilter = "";
    if (days) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      dateFilter = date.toISOString().split("T")[0];
    }

    // Get campaign metrics from view
    let query = supabase
      .from("v_campaign_metrics")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (dateFilter) {
      // Filter campaigns created after the date
      query = query.gte("campaign_id", dateFilter); // Approximation - adjust based on actual schema
    }

    const { data: campaignMetrics, error } = await query;

    if (error) {
      console.error("Error fetching campaign metrics:", error);
      // Fallback to empty data
      return NextResponse.json({
        totals: { sent: 0, opens: 0, clicks: 0, replies: 0, reply_rate: 0 },
        daily: [],
        campaigns: [],
      });
    }

    // Aggregate totals
    const totals = campaignMetrics?.reduce(
      (acc, c) => {
        acc.sent += c.sent_count || 0;
        acc.opens += c.opens || 0;
        acc.clicks += c.clicks || 0;
        acc.replies += c.replies || 0;
        return acc;
      },
      { sent: 0, opens: 0, clicks: 0, replies: 0 }
    ) || { sent: 0, opens: 0, clicks: 0, replies: 0 };

    const reply_rate = totals.sent > 0 ? (totals.replies / totals.sent) * 100 : 0;

    // Get daily metrics from send_logs and email_events
    const dailyQuery = supabase
      .from("send_logs")
      .select("id, status, created_at")
      .eq("workspace_id", workspace_id);

    if (dateFilter) {
      dailyQuery.gte("created_at", dateFilter);
    }

    const { data: sendLogs } = await dailyQuery;

    // Group by date
    const dailyMap = new Map<string, { sends: number; replies: number }>();
    
    if (sendLogs) {
      sendLogs.forEach((log: any) => {
        if (log.status === "sent") {
          const date = log.created_at.split("T")[0];
          const current = dailyMap.get(date) || { sends: 0, replies: 0 };
          current.sends += 1;
          dailyMap.set(date, current);
        }
      });
    }

    // Get replies from email_replies
    const repliesQuery = supabase
      .from("email_replies")
      .select("id, created_at")
      .eq("workspace_id", workspace_id);

    if (dateFilter) {
      repliesQuery.gte("created_at", dateFilter);
    }

    const { data: replies } = await repliesQuery;

    if (replies) {
      replies.forEach((reply: any) => {
        const date = reply.created_at.split("T")[0];
        const current = dailyMap.get(date) || { sends: 0, replies: 0 };
        current.replies += 1;
        dailyMap.set(date, current);
      });
    }

    // Convert map to array and sort by date
    const daily = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Transform campaign metrics
    const campaigns = campaignMetrics?.map((c: any) => ({
      campaign_id: c.campaign_id,
      name: c.name,
      sent_count: c.sent_count || 0,
      opens: c.opens || 0,
      clicks: c.clicks || 0,
      replies: c.replies || 0,
      reply_rate: c.reply_rate || 0,
    })) || [];

    return NextResponse.json({
      totals: {
        sent: totals.sent,
        opens: totals.opens,
        clicks: totals.clicks,
        replies: totals.replies,
        reply_rate: parseFloat(reply_rate.toFixed(2)),
      },
      daily,
      campaigns,
    });
  } catch (error) {
    console.error("Error in analytics route:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch analytics",
        totals: { sent: 0, opens: 0, clicks: 0, replies: 0, reply_rate: 0 },
        daily: [],
        campaigns: [],
      },
      { status: 500 }
    );
  }
} 