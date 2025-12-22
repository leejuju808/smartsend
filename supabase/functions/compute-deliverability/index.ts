// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    console.log("Starting deliverability metrics computation...");

    // Get all workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select("id");

    if (wsError) {
      console.error("Error fetching workspaces:", wsError);
      return new Response(JSON.stringify({ error: wsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Process each workspace
    for (const workspace of workspaces || []) {
      await processWorkspace(workspace.id, thirtyDaysAgo);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: workspaces?.length || 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in compute-deliverability:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function processWorkspace(workspaceId: string, sinceDate: Date) {
  console.log(`Processing workspace ${workspaceId}`);

  // Get all sender_inboxes for this workspace
  const { data: inboxes, error: inboxError } = await supabase
    .from("sender_inboxes")
    .select("id, email, domain_id, warmup_enabled, warmup_speed")
    .eq("workspace_id", workspaceId);

  if (inboxError) {
    console.error(`Error fetching inboxes for workspace ${workspaceId}:`, inboxError);
    return;
  }

  // Process each inbox
  for (const inbox of inboxes || []) {
    await processInbox(inbox, sinceDate);
  }

  // Get all sender_domains for this workspace
  const { data: domains, error: domainError } = await supabase
    .from("sender_domains")
    .select("id, domain, spf_valid, dkim_valid, dmarc_valid, mx_valid")
    .eq("workspace_id", workspaceId);

  if (domainError) {
    console.error(`Error fetching domains for workspace ${workspaceId}:`, domainError);
    return;
  }

  // Process each domain
  for (const domain of domains || []) {
    await processDomain(domain, inboxes || []);
  }

  // Compute workspace-level stats
  await processWorkspaceStats(workspaceId, inboxes || [], sinceDate);
}

async function processInbox(inbox: any, sinceDate: Date) {
  const workspaceId = await getWorkspaceIdFromInbox(inbox.id);
  if (!workspaceId) {
    console.error(`Could not find workspace for inbox ${inbox.id}`);
    return;
  }

  // Get campaigns for this workspace
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (campaignsError) {
    console.error(`Error fetching campaigns for workspace ${workspaceId}:`, campaignsError);
    return;
  }

  const campaignIds = (campaigns || []).map((c: any) => c.id);
  if (campaignIds.length === 0) {
    // No campaigns, set default values
    await supabase.from("inbox_health").upsert({
      inbox_id: inbox.id,
      spam_rate: 0,
      bounce_rate: 0,
      open_rate: 0,
      click_rate: 0,
      warmup_stage: inbox.warmup_enabled ? 0 : -1,
      score: 50,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  // Get send_logs for campaigns in this workspace
  // Note: For v1, we calculate metrics at workspace level per inbox
  // In v2, we can improve by matching through campaign_steps.sender_inbox_id
  const { data: sendLogs, error: logsError } = await supabase
    .from("send_logs")
    .select("id, status, sent_at, campaign_id, created_at")
    .in("campaign_id", campaignIds)
    .eq("status", "sent");

  if (logsError) {
    console.error(`Error fetching send_logs for inbox ${inbox.id}:`, logsError);
    return;
  }

  // Filter by date (use sent_at if available, otherwise created_at)
  const filteredLogs = (sendLogs || []).filter((log: any) => {
    const date = log.sent_at || log.created_at;
    return date && new Date(date) >= sinceDate;
  });

  const totalSends = filteredLogs.length;

  if (totalSends === 0) {
    // No sends yet, set default values
    await supabase.from("inbox_health").upsert({
      inbox_id: inbox.id,
      spam_rate: 0,
      bounce_rate: 0,
      open_rate: 0,
      click_rate: 0,
      warmup_stage: inbox.warmup_enabled ? 0 : -1,
      score: 50,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  // Get delivery_events for these logs
  const logIds = filteredLogs.map((l: any) => l.id);
  const { data: events, error: eventsError } = await supabase
    .from("delivery_events")
    .select("kind, log_id")
    .in("log_id", logIds);

  if (eventsError) {
    console.error(`Error fetching delivery_events for inbox ${inbox.id}:`, eventsError);
    return;
  }

  // Calculate metrics
  const bounces = (events || []).filter((e: any) => e.kind === "bounce").length;
  const spamReports = (events || []).filter((e: any) => e.kind === "spam").length;
  const opens = (events || []).filter((e: any) => e.kind === "open").length;
  const clicks = (events || []).filter((e: any) => e.kind === "click").length;

  const bounceRate = totalSends > 0 ? bounces / totalSends : 0;
  const spamRate = totalSends > 0 ? spamReports / totalSends : 0;
  const openRate = totalSends > 0 ? opens / totalSends : 0;
  const clickRate = totalSends > 0 ? clicks / totalSends : 0;

  // Get current inbox health to check warmup stage
  const { data: currentHealth } = await supabase
    .from("inbox_health")
    .select("warmup_stage, score, updated_at")
    .eq("inbox_id", inbox.id)
    .single();

  let warmupStage = currentHealth?.warmup_stage ?? 0;
  
  // If warmup is enabled, increase stage daily
  if (inbox.warmup_enabled) {
    // Check if we've already updated today
    const lastUpdate = currentHealth?.updated_at 
      ? new Date(currentHealth.updated_at)
      : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const lastUpdateDate = lastUpdate ? new Date(lastUpdate) : null;
    if (lastUpdateDate) {
      lastUpdateDate.setHours(0, 0, 0, 0);
    }
    
    // If last update was before today, increase warmup stage
    if (!lastUpdateDate || lastUpdateDate.getTime() < today.getTime()) {
      // Count warmup emails sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const { count: warmupCount } = await supabase
        .from("warmup_queue")
        .select("*", { count: "exact", head: true })
        .eq("inbox_id", inbox.id)
        .gte("sent_at", todayStart.toISOString())
        .not("sent_at", "is", null);
      
      // Only increase stage if warmup emails were sent
      if (warmupCount && warmupCount > 0) {
        // Determine increment based on warmup_speed
        const increment = inbox.warmup_speed === 'fast' ? 2 : inbox.warmup_speed === 'slow' ? 0.5 : 1;
        warmupStage = Math.floor((warmupStage || 0) + increment);
      }
    }
  } else {
    warmupStage = -1; // Warmup disabled
  }

  // Calculate score (weighted: bounce rate penalty, spam penalty, open/click bonus)
  let score = 50;
  score -= bounceRate * 100 * 2; // -2 points per 1% bounce rate
  score -= spamRate * 100 * 5; // -5 points per 1% spam rate
  score += openRate * 30; // +30 points for 100% open rate
  score += clickRate * 20; // +20 points for 100% click rate
  
  // Warmup bonus: +1 point per warmup stage (up to +10)
  if (warmupStage > 0) {
    score += Math.min(warmupStage, 10);
  }
  
  score = Math.max(0, Math.min(100, score)); // Clamp 0-100

  // Upsert inbox_health
  const { error: upsertError } = await supabase.from("inbox_health").upsert({
    inbox_id: inbox.id,
    spam_rate: spamRate,
    bounce_rate: bounceRate,
    open_rate: openRate,
    click_rate: clickRate,
    warmup_stage: warmupStage,
    score: Math.round(score),
    updated_at: new Date().toISOString(),
  });

  if (upsertError) {
    console.error(`Error upserting inbox_health for ${inbox.id}:`, upsertError);
  }
}

async function processDomain(domain: any, inboxes: any[]) {
  // Use the new compute_domain_reputation_score function
  const { data: reputationScore, error: scoreError } = await supabase.rpc(
    "compute_domain_reputation_score",
    { p_domain_id: domain.id }
  );

  if (scoreError) {
    console.error(`Error computing domain reputation score for ${domain.id}:`, scoreError);
    return;
  }

  // Update domain_health_score in sender_domains
  const { error: updateError } = await supabase
    .from("sender_domains")
    .update({
      domain_health_score: reputationScore || 50,
    })
    .eq("id", domain.id);

  if (updateError) {
    console.error(`Error updating domain_health_score for ${domain.id}:`, updateError);
  }

  // Apply protection if needed
  await supabase.rpc("apply_domain_protection", {
    p_domain_id: domain.id,
  }).catch((err) => {
    console.error(`Error applying domain protection for ${domain.id}:`, err);
  });

  // Also update domain_reputation table for backward compatibility
  await supabase.from("domain_reputation").upsert({
    domain_id: domain.id,
    reputation_score: Math.round(reputationScore || 50),
    updated_at: new Date().toISOString(),
  }).catch((err) => {
    // Ignore if table doesn't exist
    console.log(`domain_reputation table may not exist:`, err);
  });
}

async function processWorkspaceStats(workspaceId: string, inboxes: any[], sinceDate: Date) {
  if (inboxes.length === 0) {
    await supabase.from("workspace_deliverability").upsert({
      workspace_id: workspaceId,
      spam_rate: 0,
      bounce_rate: 0,
      avg_open_rate: 0,
      avg_click_rate: 0,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const inboxIds = inboxes.map((i: any) => i.id);
  const { data: healths, error: healthError } = await supabase
    .from("inbox_health")
    .select("spam_rate, bounce_rate, open_rate, click_rate")
    .in("inbox_id", inboxIds);

  if (healthError) {
    console.error(`Error fetching workspace health stats:`, healthError);
    return;
  }

  const avgSpamRate =
    (healths || []).length > 0
      ? (healths || []).reduce((sum: number, h: any) => sum + (h.spam_rate || 0), 0) /
        (healths || []).length
      : 0;

  const avgBounceRate =
    (healths || []).length > 0
      ? (healths || []).reduce((sum: number, h: any) => sum + (h.bounce_rate || 0), 0) /
        (healths || []).length
      : 0;

  const avgOpenRate =
    (healths || []).length > 0
      ? (healths || []).reduce((sum: number, h: any) => sum + (h.open_rate || 0), 0) /
        (healths || []).length
      : 0;

  const avgClickRate =
    (healths || []).length > 0
      ? (healths || []).reduce((sum: number, h: any) => sum + (h.click_rate || 0), 0) /
        (healths || []).length
      : 0;

  await supabase.from("workspace_deliverability").upsert({
    workspace_id: workspaceId,
    spam_rate: avgSpamRate,
    bounce_rate: avgBounceRate,
    avg_open_rate: avgOpenRate,
    avg_click_rate: avgClickRate,
    updated_at: new Date().toISOString(),
  });
}

async function getWorkspaceIdFromInbox(inboxId: string): Promise<string | null> {
  const { data } = await supabase
    .from("sender_inboxes")
    .select("workspace_id")
    .eq("id", inboxId)
    .single();
  return data?.workspace_id || null;
}

