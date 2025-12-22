// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface CampaignAnalyticsData {
  overall: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    replies: number;
    meetings: number;
    deals_created: number;
    deals_won: number;
  };
  steps: Array<{
    step: number;
    sent: number;
    opens: number;
    replies: number;
    meetings: number;
    dropoff_after: number;
  }>;
  variants: Array<{
    variant_id: string;
    label: string;
    sent: number;
    opens: number;
    replies: number;
    meetings: number;
    reply_rate: number;
    meeting_rate: number;
  }>;
  reply_reasons: {
    meeting_intent: number;
    interested: number;
    neutral: number;
    objection_price: number;
    objection_timing: number;
    not_interested: number;
    wrong_contact: number;
  };
  conversion: {
    reply_to_meeting_rate: number;
    meeting_to_deal_rate: number;
    deal_win_rate: number;
  };
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaign_id");
    
    if (campaignId) {
      // Generate analytics for a specific campaign
      const result = await generateAnalyticsForCampaign(campaignId);
      return new Response(
        JSON.stringify({ ok: true, campaign_id: campaignId, ...result }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Generate analytics for all active/recently active campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, workspace_id, status, updated_at")
      .in("status", ["running", "active", "scheduled", "completed"])
      .gte("updated_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // Last 90 days
      .limit(100);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return new Response(
        JSON.stringify({ ok: false, error: campaignsError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const campaign of campaigns || []) {
      try {
        await generateAnalyticsForCampaign(campaign.id);
        processed++;
      } catch (e) {
        console.error(`Error processing campaign ${campaign.id}:`, e);
        errors.push(`Campaign ${campaign.id}: ${String(e)}`);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("Error in generate-campaign-analytics-v2:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function generateAnalyticsForCampaign(campaignId: string): Promise<{ updated: boolean }> {
  // Get campaign workspace_id
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  const workspaceId = campaign.workspace_id;

  // ============================================================================
  // 1. Aggregate from send_logs: sent, delivered, opens, clicks by step and variant
  // ============================================================================

  const { data: sendLogs, error: sendLogsError } = await supabase
    .from("send_logs")
    .select("id, step_no, variant_id, template_variant_id, status, opened_at, clicked_at, lead_id, delivered_at")
    .eq("campaign_id", campaignId);

  if (sendLogsError) {
    throw new Error(`Error fetching send_logs: ${sendLogsError.message}`);
  }

  // Get delivery events for more accurate tracking
  const logIds = sendLogs?.map((log) => log.id) || [];
  let deliveryEvents: any[] = [];
  
  if (logIds.length > 0) {
    // Try both log_id and send_log_id columns
    const { data: eventsByLogId } = await supabase
      .from("delivery_events")
      .select("log_id, send_log_id, kind")
      .in("log_id", logIds);
    
    const { data: eventsBySendLogId } = await supabase
      .from("delivery_events")
      .select("log_id, send_log_id, kind")
      .in("send_log_id", logIds);
    
    // Combine and deduplicate
    const allEvents = [...(eventsByLogId || []), ...(eventsBySendLogId || [])];
    const seen = new Set<string>();
    deliveryEvents = allEvents.filter((e) => {
      const key = `${e.log_id || e.send_log_id}-${e.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Build event maps for faster lookup (handle both log_id and send_log_id)
  const logDelivered = new Set(
    deliveryEvents
      .filter((e) => e.kind === "delivered")
      .map((e) => e.send_log_id || e.log_id)
      .filter(Boolean)
  );
  const logOpened = new Set(
    deliveryEvents
      .filter((e) => e.kind === "open")
      .map((e) => e.send_log_id || e.log_id)
      .filter(Boolean)
  );
  const logClicked = new Set(
    deliveryEvents
      .filter((e) => e.kind === "click")
      .map((e) => e.send_log_id || e.log_id)
      .filter(Boolean)
  );

  const sent = sendLogs?.filter((log) => log.status === "sent" || log.status === "delivered").length || 0;
  const delivered = sendLogs?.filter((log) => 
    log.status === "delivered" || 
    log.delivered_at || 
    logDelivered.has(log.id)
  ).length || 0;
  const opens = sendLogs?.filter((log) => 
    log.opened_at || logOpened.has(log.id)
  ).length || 0;
  const clicks = sendLogs?.filter((log) => 
    log.clicked_at || logClicked.has(log.id)
  ).length || 0;

  // Group by step
  const stepMetrics: Record<number, { sent: number; opens: number; replies: number; meetings: number }> = {};
  
  for (const log of sendLogs || []) {
    const step = log.step_no || 1;
    if (!stepMetrics[step]) {
      stepMetrics[step] = { sent: 0, opens: 0, replies: 0, meetings: 0 };
    }
    if (log.status === "sent" || log.status === "delivered") {
      stepMetrics[step].sent++;
    }
    if (log.opened_at || logOpened.has(log.id)) {
      stepMetrics[step].opens++;
    }
  }

  // ============================================================================
  // 2. Aggregate replies from reply_threads
  // ============================================================================

  const { data: replyThreads, error: replyThreadsError } = await supabase
    .from("reply_threads")
    .select("id, lead_id, labels, intent_primary, intent_secondary, campaign_id")
    .eq("campaign_id", campaignId);

  if (replyThreadsError) {
    console.warn(`Error fetching reply_threads: ${replyThreadsError.message}`);
  }

  const replies = replyThreads?.length || 0;

  // Count reply reasons
  const replyReasons = {
    meeting_intent: 0,
    interested: 0,
    neutral: 0,
    objection_price: 0,
    objection_timing: 0,
    not_interested: 0,
    wrong_contact: 0,
  };

  // Get reply_labels for more detailed classification
  const threadIds = replyThreads?.map((t) => t.id) || [];
  let replyLabels: any[] = [];
  
  if (threadIds.length > 0) {
    const { data: labels } = await supabase
      .from("reply_labels")
      .select("thread_id, label")
      .in("thread_id", threadIds);
    replyLabels = labels || [];
  }

  // Count reasons from reply_labels
  for (const label of replyLabels) {
    const labelName = label.label?.toLowerCase() || "";
    if (labelName.includes("meeting_intent") || labelName === "meeting") {
      replyReasons.meeting_intent++;
    } else if (labelName.includes("interested") || labelName === "positive") {
      replyReasons.interested++;
    } else if (labelName.includes("neutral")) {
      replyReasons.neutral++;
    } else if (labelName.includes("price") || labelName.includes("budget") || labelName.includes("cost")) {
      replyReasons.objection_price++;
    } else if (labelName.includes("timing") || labelName.includes("time")) {
      replyReasons.objection_timing++;
    } else if (labelName.includes("not_interested") || labelName.includes("unsubscribe")) {
      replyReasons.not_interested++;
    } else if (labelName.includes("wrong") || labelName.includes("routing")) {
      replyReasons.wrong_contact++;
    }
  }

  // Also check intent_primary from threads
  for (const thread of replyThreads || []) {
    const primary = thread.intent_primary?.toLowerCase() || "";
    if (primary === "meeting_intent" || primary === "meeting") {
      replyReasons.meeting_intent++;
    } else if (primary === "interested" || primary === "positive") {
      replyReasons.interested++;
    } else if (primary === "neutral") {
      replyReasons.neutral++;
    }
  }

  // Map replies to steps (find which send_log triggered the reply)
  const leadToStepMap: Record<string, number> = {};
  for (const log of sendLogs || []) {
    if (log.lead_id && log.step_no) {
      leadToStepMap[log.lead_id] = log.step_no;
    }
  }

  for (const thread of replyThreads || []) {
    const step = leadToStepMap[thread.lead_id] || 1;
    if (stepMetrics[step]) {
      stepMetrics[step].replies++;
    }
  }

  // ============================================================================
  // 3. Aggregate meetings from meeting_intents
  // ============================================================================

  const { data: meetingIntents, error: meetingIntentsError } = await supabase
    .from("meeting_intents")
    .select("id, lead_id, campaign_id")
    .eq("campaign_id", campaignId);

  if (meetingIntentsError) {
    console.warn(`Error fetching meeting_intents: ${meetingIntentsError.message}`);
  }

  const meetings = meetingIntents?.length || 0;

  // Map meetings to steps
  for (const meeting of meetingIntents || []) {
    const step = leadToStepMap[meeting.lead_id] || 1;
    if (stepMetrics[step]) {
      stepMetrics[step].meetings++;
    }
  }

  // ============================================================================
  // 4. Aggregate deals
  // ============================================================================

  // Get leads for this campaign
  const leadIds = [...new Set(sendLogs?.map((log) => log.lead_id).filter(Boolean) || [])];
  
  let dealsCreated = 0;
  let dealsWon = 0;

  if (leadIds.length > 0) {
    const { data: deals, error: dealsError } = await supabase
      .from("deals")
      .select("id, lead_id, stage")
      .in("lead_id", leadIds)
      .eq("workspace_id", workspaceId);

    if (!dealsError && deals) {
      dealsCreated = deals.length;
      dealsWon = deals.filter((d) => d.stage === "closed_won").length;
    }
  }

  // ============================================================================
  // 5. Aggregate by variant
  // ============================================================================

  const variantMetrics: Record<string, { label: string; sent: number; opens: number; replies: number; meetings: number }> = {};

  // Get variant info from template_variants
  const variantIds = [...new Set(sendLogs?.map((log) => log.template_variant_id || log.variant_id).filter(Boolean) || [])];
  
  let variantInfo: Record<string, { name: string; is_winner: boolean }> = {};
  
  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("template_variants")
      .select("id, name, is_winner")
      .in("id", variantIds);
    
    for (const v of variants || []) {
      variantInfo[v.id] = { name: v.name || "Unknown", is_winner: v.is_winner || false };
    }
  }

  // Aggregate by variant
  for (const log of sendLogs || []) {
    const variantId = log.template_variant_id || log.variant_id;
    if (!variantId) continue;

    if (!variantMetrics[variantId]) {
      variantMetrics[variantId] = {
        label: variantInfo[variantId]?.name || "Unknown",
        sent: 0,
        opens: 0,
        replies: 0,
        meetings: 0,
      };
    }

    if (log.status === "sent" || log.status === "delivered") {
      variantMetrics[variantId].sent++;
    }
    if (log.opened_at || logOpened.has(log.id)) {
      variantMetrics[variantId].opens++;
    }
  }

  // Map replies and meetings to variants
  for (const thread of replyThreads || []) {
    // Find the send_log that triggered this reply
    const { data: relatedLogs } = await supabase
      .from("send_logs")
      .select("variant_id, template_variant_id")
      .eq("campaign_id", campaignId)
      .eq("lead_id", thread.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (relatedLogs) {
      const variantId = relatedLogs.template_variant_id || relatedLogs.variant_id;
      if (variantId && variantMetrics[variantId]) {
        variantMetrics[variantId].replies++;
      }
    }
  }

  for (const meeting of meetingIntents || []) {
    const { data: relatedLogs } = await supabase
      .from("send_logs")
      .select("variant_id, template_variant_id")
      .eq("campaign_id", campaignId)
      .eq("lead_id", meeting.lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (relatedLogs) {
      const variantId = relatedLogs.template_variant_id || relatedLogs.variant_id;
      if (variantId && variantMetrics[variantId]) {
        variantMetrics[variantId].meetings++;
      }
    }
  }

  // ============================================================================
  // 6. Calculate dropoffs and conversion rates
  // ============================================================================

  const stepsArray = Object.entries(stepMetrics)
    .map(([step, metrics]) => ({
      step: parseInt(step),
      sent: metrics.sent,
      opens: metrics.opens,
      replies: metrics.replies,
      meetings: metrics.meetings,
      dropoff_after: metrics.sent - metrics.opens, // Simplified dropoff calculation
    }))
    .sort((a, b) => a.step - b.step);

  const variantsArray = Object.entries(variantMetrics).map(([variantId, metrics]) => ({
    variant_id: variantId,
    label: metrics.label,
    sent: metrics.sent,
    opens: metrics.opens,
    replies: metrics.replies,
    meetings: metrics.meetings,
    reply_rate: metrics.sent > 0 ? metrics.replies / metrics.sent : 0,
    meeting_rate: metrics.sent > 0 ? metrics.meetings / metrics.sent : 0,
  }));

  const conversion = {
    reply_to_meeting_rate: replies > 0 ? meetings / replies : 0,
    meeting_to_deal_rate: meetings > 0 ? dealsCreated / meetings : 0,
    deal_win_rate: dealsCreated > 0 ? dealsWon / dealsCreated : 0,
  };

  // ============================================================================
  // 7. Build analytics data structure
  // ============================================================================

  const analyticsData: CampaignAnalyticsData = {
    overall: {
      sent,
      delivered,
      opens,
      clicks,
      replies,
      meetings,
      deals_created: dealsCreated,
      deals_won: dealsWon,
    },
    steps: stepsArray,
    variants: variantsArray,
    reply_reasons: replyReasons,
    conversion,
  };

  // ============================================================================
  // 8. Upsert into campaign_analytics
  // ============================================================================

  const { error: upsertError } = await supabase
    .from("campaign_analytics")
    .upsert(
      {
        workspace_id: workspaceId,
        campaign_id: campaignId,
        data: analyticsData,
        generated_at: new Date().toISOString(),
      },
      {
        onConflict: "campaign_id",
      }
    );

  if (upsertError) {
    throw new Error(`Error upserting analytics: ${upsertError.message}`);
  }

  return { updated: true };
}

