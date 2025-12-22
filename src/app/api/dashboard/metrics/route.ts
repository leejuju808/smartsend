import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { unstable_cache } from "next/cache";

type Totals = {
  queued: number;
  sent: number;
  failed: number;
  replied: number;
};

// Get analytics data with caching (1 hour revalidation)
const getCachedAnalytics = unstable_cache(
  async (workspace_id: string) => {
    const supabase = getServerSupabase();

    // Get campaign IDs for this workspace
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspace_id);

    if (campaignsError) throw new Error(campaignsError.message);

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return {
        ok: true,
        totals: { queued: 0, sent: 0, failed: 0, replied: 0 },
        series: [],
      };
    }

    // Get totals from send_queue
    const { data: queueData, error: queueError } = await supabase
      .from("send_queue")
      .select("status")
      .in("campaign_id", campaignIds);

    if (queueError) throw new Error(queueError.message);

    const totals: Totals = {
      queued: queueData?.filter((q) => q.status === "queued" || q.status === "sending").length || 0,
      sent: queueData?.filter((q) => q.status === "sent").length || 0,
      failed: queueData?.filter((q) => q.status === "failed").length || 0,
      replied: 0,
    };

    // Get replied count from campaign_logs
    const { count: repliedCount, error: repliedError } = await supabase
      .from("campaign_logs")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("event", "replied");

    if (repliedError) throw new Error(repliedError.message);

    totals.replied = repliedCount || 0;

    // Get last 7 days series
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: logsData, error: logsError } = await supabase
      .from("campaign_logs")
      .select("event, created_at")
      .in("campaign_id", campaignIds)
      .in("event", ["sent", "failed", "replied"])
      .gte("created_at", sevenDaysAgo.toISOString());

    if (logsError) throw new Error(logsError.message);

    // Generate 7 days of dates
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split("T")[0]);
    }

    // Aggregate by day
    const series = days.map((day) => {
      const dayLogs = logsData?.filter((log) => {
        const logDay = new Date(log.created_at).toISOString().split("T")[0];
        return logDay === day;
      }) || [];

      const date = new Date(day);
      const dayLabel = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return {
        day: dayLabel,
        sent: dayLogs.filter((l) => l.event === "sent").length,
        failed: dayLogs.filter((l) => l.event === "failed").length,
        replied: dayLogs.filter((l) => l.event === "replied").length,
      };
    });

    return { ok: true, totals, series };
  },
  ["dashboard-metrics"],
  { revalidate: 3600 }
);

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  try {
    const data = await getCachedAnalytics(gate.workspace_id);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("Dashboard metrics error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "Unknown error" }, { status: 500 });
  }
} 