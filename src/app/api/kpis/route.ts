import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

type Timeframe = "today" | "7d" | "30d";

function getStartForTimeframe(tf: Timeframe): string {
  const now = new Date();
  if (tf === "today") {
    // UTC midnight
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    return start.toISOString();
  }
  const days = tf === "7d" ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  try {
    const { searchParams } = new URL(req.url);
    const tf = (searchParams.get("tf") as Timeframe) || "today";
    const campaignId = searchParams.get("campaignId");
    const startIso = getStartForTimeframe(tf);

    const supabase = getServerSupabase();
    const workspace_id = gate.workspace_id;

    // Leads Imported
    let leadsImported = 0;
    if (campaignId) {
      const { count, error } = await supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .gte("created_at", startIso);
      if (error) throw error;
      leadsImported = count || 0;
    } else {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace_id)
        .gte("created_at", startIso);
      if (error) throw error;
      leadsImported = count || 0;
    }

    // In Queue (queued or sending)
    const inQueueQuery = supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "sending"])
      .gte("created_at", startIso);
    if (campaignId) inQueueQuery.eq("campaign_id", campaignId);
    // If workspace_id column exists (migration adds it), use it for fast scope; otherwise rely on RLS via campaign link
    inQueueQuery.eq("workspace_id", workspace_id);
    const { count: inQueue, error: inQueueErr } = await inQueueQuery;
    if (inQueueErr) throw inQueueErr;

    // Sent count
    const sentQuery = supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startIso);
    if (campaignId) sentQuery.eq("campaign_id", campaignId);
    sentQuery.eq("workspace_id", workspace_id);
    const { count: sent, error: sentErr } = await sentQuery;
    if (sentErr) throw sentErr;

    // Failed count (for fail rate)
    const failedQuery = supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", startIso);
    if (campaignId) failedQuery.eq("campaign_id", campaignId);
    failedQuery.eq("workspace_id", workspace_id);
    const { count: failed, error: failedErr } = await failedQuery;
    if (failedErr) throw failedErr;

    // Replies (from campaign_logs where event = 'replied')
    const repliesQuery = supabase
      .from("campaign_logs")
      .select("id", { count: "exact", head: true })
      .eq("event", "replied")
      .gte("created_at", startIso);
    if (campaignId) {
      repliesQuery.eq("campaign_id", campaignId);
    } else {
      // Filter by campaigns in this workspace
      const { data: campaigns, error: cErr } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", workspace_id);
      if (cErr) throw cErr;
      const ids = (campaigns || []).map((c) => c.id);
      if (ids.length === 0) {
        return NextResponse.json({
          ok: true,
          metrics: { leadsImported, inQueue: inQueue || 0, sent: sent || 0, replies: 0, failRate: 0 },
        });
      }
      repliesQuery.in("campaign_id", ids);
    }
    const { count: replies, error: repliesErr } = await repliesQuery;
    if (repliesErr) throw repliesErr;

    const failRate = sent && sent > 0 ? Math.round(((failed || 0) / sent) * 100) : 0;

    return NextResponse.json({
      ok: true,
      metrics: {
        leadsImported,
        inQueue: inQueue || 0,
        sent: sent || 0,
        replies: replies || 0,
        failRate,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "metrics failed" }, { status: 500 });
  }
}


