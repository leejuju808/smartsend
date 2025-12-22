import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const supabase = getServerSupabase();
  const accountId = gate.workspace_id; // Using workspace_id as account_id

  try {
    // Global queue stats
    const { data: queueData, error: queueError } = await supabase.rpc(
      "get_global_queue_stats",
      { account_id_param: accountId }
    );

    if (queueError) {
      console.error("Error fetching queue stats:", queueError);
    }

    // Deliverability overview
    const { data: delivData, error: delivError } = await supabase.rpc(
      "get_deliverability_overview",
      { account_id_param: accountId }
    );

    if (delivError) {
      console.error("Error fetching deliverability stats:", delivError);
    }

    // Hot accounts (companies with intent_score >= 5)
    // Note: Companies table uses org_id, so we need to get org_id from user profile
    const orgId = await getCurrentOrgId();
    let hotAccounts: any[] = [];
    if (orgId) {
      const { data: hot, error: hotError } = await supabase
        .from("companies")
        .select("id, name, intent_score, domain")
        .eq("org_id", orgId)
        .gte("intent_score", 5)
        .order("intent_score", { ascending: false })
        .limit(10);

      if (hotError) {
        console.error("Error fetching hot accounts:", hotError);
      } else {
        hotAccounts = hot || [];
      }
    }

    // SmartList stats
    const { data: smartlistsData, error: smartlistsError } = await supabase.rpc(
      "get_smartlist_stats",
      { account_id_param: accountId }
    );

    if (smartlistsError) {
      console.error("Error fetching SmartList stats:", smartlistsError);
    }

    // AI events: SmartList refresh, followups, handoffs
    const { data: aiEvents, error: aiEventsError } = await supabase
      .from("activity_log")
      .select("*")
      .eq("account_id", accountId)
      .in("event_type", [
        "smartlist_refresh",
        "scheduler_dispatch",
        "deliverability_pause",
        "assigned",
        "campaign_paused",
        "campaign_resumed",
      ])
      .order("created_at", { ascending: false })
      .limit(20);

    if (aiEventsError) {
      console.error("Error fetching AI events:", aiEventsError);
    }

    // Calculate System Heat Index
    const queue = queueData || {
      pending: 0,
      processing: 0,
      failed: 0,
      retries: 0,
    };
    const deliv = delivData || {
      avg_reputation: 100,
      bounces_24h: 0,
      unsubs_24h: 0,
      sent_24h: 0,
    };

    // Calculate queue pressure (0-100)
    const totalQueue = queue.pending + queue.processing + queue.failed;
    const queuePressure = totalQueue > 0 
      ? Math.min(100, (queue.failed / totalQueue) * 100 + (queue.pending / 100) * 10)
      : 0;

    // Deliverability score (0-100, inverted so higher is better)
    const deliverabilityScore = deliv.avg_reputation || 100;

    // AI event rate (events in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentEvents } = await supabase
      .from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("created_at", oneHourAgo);

    const aiEventRate = Math.min(100, (recentEvents || 0) * 5); // Scale: 20 events = 100%

    // Campaign activity level (active campaigns)
    const { count: activeCampaigns } = await supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", accountId)
      .eq("status", "active");

    const campaignActivity = Math.min(100, (activeCampaigns || 0) * 10); // Scale: 10 campaigns = 100%

    // Heat index = average of all components
    const heatIndex = Math.round(
      (queuePressure + deliverabilityScore + aiEventRate + campaignActivity) / 4
    );

    return NextResponse.json({
      queue: queueData || {
        pending: 0,
        processing: 0,
        failed: 0,
        retries: 0,
        oldest: null,
        newest: null,
      },
      deliverability: delivData || {
        avg_reputation: 100,
        bounces_24h: 0,
        unsubs_24h: 0,
        sent_24h: 0,
      },
      hot_accounts: hotAccounts,
      smartlists: smartlistsData || [],
      ai_events: aiEvents || [],
      heat_index: heatIndex,
    });
  } catch (error) {
    console.error("Command center error:", error);
    return NextResponse.json(
      { error: "Failed to fetch command center data" },
      { status: 500 }
    );
  }
}

