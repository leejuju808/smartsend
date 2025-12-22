import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface InboxFleetData {
  inbox_id: string;
  email: string;
  domain: string;
  health_score: number;
  deliverability_risk: string;
  bounce_trend: string;
  warmup_stage: string;
  domain_risk: string;
  predicted_open_rate: number;
  predicted_reply_rate: number;
  domain_age_days: number;
  inbox_age_days: number;
  last_7day_sent: number;
  last_7day_bounced: number;
  last_7day_spam: number;
  last_7day_opened: number;
  last_7day_replied: number;
  bounce_rate: number;
  spam_rate: number;
  open_rate: number;
  reply_rate: number;
}

interface FleetDecision {
  inbox_id: string;
  email: string;
  domain: string;
  current_daily_cap: number | null;
  recommended_daily_cap: number;
  recommended_hourly_cap: number;
  recommended_warmup_cap: number;
  action: 'boost' | 'throttle' | 'pause' | 'resume' | 'maintain';
  reason: string;
  health_score: number;
  risk_level: 'low' | 'medium' | 'high';
}

Deno.serve(async () => {
  try {
    console.log("Starting Fleet Manager v1...");

    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      console.error("Error fetching workspaces:", workspacesError);
      return new Response(
        JSON.stringify({ ok: false, error: workspacesError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    for (const workspace of workspaces || []) {
      try {
        console.log(`Processing workspace ${workspace.id}...`);
        await processFleetForWorkspace(workspace.id);
        processed++;
      } catch (e) {
        console.error(`Error processing workspace ${workspace.id}:`, e);
        errors.push(`Workspace ${workspace.id}: ${String(e)}`);
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
  } catch (error) {
    console.error("Fatal error in Fleet Manager:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function processFleetForWorkspace(workspaceId: string) {
  console.log(`Processing fleet for workspace ${workspaceId}`);

  // Get all connected inboxes for this workspace
  const { data: inboxes, error: inboxesError } = await supabase
    .from("sender_inboxes")
    .select(`
      id,
      email,
      workspace_id,
      daily_limit,
      connected,
      sender_domains!inner(domain)
    `)
    .eq("workspace_id", workspaceId)
    .eq("connected", true);

  if (inboxesError) {
    throw new Error(`Error fetching inboxes: ${inboxesError.message}`);
  }

  if (!inboxes || inboxes.length === 0) {
    console.log(`No connected inboxes found for workspace ${workspaceId}`);
    return;
  }

  console.log(`Found ${inboxes.length} connected inboxes`);

  const decisions: FleetDecision[] = [];

  // Process each inbox
  for (const inbox of inboxes) {
    try {
      const decision = await analyzeInboxForFleet(inbox.id, workspaceId);
      if (decision) {
        decisions.push(decision);
      }
    } catch (e) {
      console.error(`Error analyzing inbox ${inbox.id}:`, e);
    }
  }

  // Apply decisions
  for (const decision of decisions) {
    await applyFleetDecision(decision, workspaceId);
  }

  // Check domain-level risks and apply domain protection
  await applyDomainLevelProtection(workspaceId, decisions);

  // Check for fallback scenarios
  await checkAndApplyFallbacks(workspaceId, decisions);

  console.log(`Processed ${decisions.length} inbox decisions for workspace ${workspaceId}`);
}

async function analyzeInboxForFleet(
  inboxId: string,
  workspaceId: string
): Promise<FleetDecision | null> {
  // Get fleet score using database function
  const { data: scoreData, error: scoreError } = await supabase.rpc(
    "calculate_fleet_inbox_score",
    { p_inbox_id: inboxId }
  );

  if (scoreError || !scoreData) {
    console.error(`Error calculating fleet score for inbox ${inboxId}:`, scoreError);
    return null;
  }

  const score = scoreData as InboxFleetData;

  // Get current limits
  const { data: currentLimits } = await supabase
    .from("inbox_limits")
    .select("*")
    .eq("inbox_id", inboxId)
    .single();

  // Get inbox info
  const { data: inbox } = await supabase
    .from("sender_inboxes")
    .select(`
      email,
      sender_domains!inner(
        domain
      )
    `)
    .eq("id", inboxId)
    .single();

  if (!inbox) {
    return null;
  }

  const domain = (inbox.sender_domains as any)?.domain || '';

  // Calculate recommended limits
  const { data: recommendedDailyCap } = await supabase.rpc(
    "calculate_safe_daily_limit",
    { p_inbox_id: inboxId }
  );

  const recommendedDaily = recommendedDailyCap || 100;
  const recommendedHourly = Math.ceil(recommendedDaily / 12); // Distribute across 12 hours
  const recommendedWarmup = score.warmup_stage === 'stage_1' ? 10 :
                           score.warmup_stage === 'stage_2' ? 40 :
                           score.warmup_stage === 'stage_3' ? 80 : 150;

  // Determine action
  let action: 'boost' | 'throttle' | 'pause' | 'resume' | 'maintain' = 'maintain';
  let reason = '';
  let riskLevel: 'low' | 'medium' | 'high' = 'low';

  const currentCap = currentLimits?.daily_cap || inbox.daily_limit || 100;

  // Determine risk level
  if (score.deliverability_risk === 'high' || score.domain_risk === 'high' || score.health_score < 30) {
    riskLevel = 'high';
  } else if (score.deliverability_risk === 'medium' || score.domain_risk === 'medium' || score.health_score < 60) {
    riskLevel = 'medium';
  }

  // Check if inbox should be paused
  const { data: health } = await supabase
    .from("inbox_health")
    .select("is_paused, pause_reason")
    .eq("inbox_id", inboxId)
    .single();

  if (riskLevel === 'high' && score.health_score < 30) {
    action = 'pause';
    reason = `Health score ${score.health_score} below threshold. Bounce rate: ${(score.bounce_rate * 100).toFixed(2)}%, Spam rate: ${(score.spam_rate * 100).toFixed(2)}%`;
  } else if (health?.is_paused && score.health_score >= 60 && score.deliverability_risk === 'low') {
    action = 'resume';
    reason = `Health recovered. Score: ${score.health_score}`;
  } else if (recommendedDaily > currentCap * 1.1) {
    action = 'boost';
    reason = `High health score (${score.health_score}). Predicted reply rate: ${(score.predicted_reply_rate * 100).toFixed(2)}%`;
  } else if (recommendedDaily < currentCap * 0.7) {
    action = 'throttle';
    reason = `Risk detected. Deliverability risk: ${score.deliverability_risk}, Domain risk: ${score.domain_risk}`;
  } else {
    action = 'maintain';
    reason = `Stable performance. Health: ${score.health_score}`;
  }

  return {
    inbox_id: inboxId,
    email: inbox.email,
    domain: domain,
    current_daily_cap: currentCap,
    recommended_daily_cap: recommendedDaily,
    recommended_hourly_cap: recommendedHourly,
    recommended_warmup_cap: recommendedWarmup,
    action,
    reason,
    health_score: score.health_score,
    risk_level: riskLevel,
  };
}

async function applyFleetDecision(
  decision: FleetDecision,
  workspaceId: string
) {
  // Upsert inbox_limits
  const { error: limitsError } = await supabase
    .from("inbox_limits")
    .upsert({
      inbox_id: decision.inbox_id,
      daily_cap: decision.recommended_daily_cap,
      hourly_cap: decision.recommended_hourly_cap,
      warmup_cap: decision.recommended_warmup_cap,
      dynamic: true,
    }, {
      onConflict: 'inbox_id'
    });

  if (limitsError) {
    console.error(`Error updating limits for inbox ${decision.inbox_id}:`, limitsError);
    return;
  }

  // Update inbox_health if pausing/resuming
  if (decision.action === 'pause') {
    const { error: pauseError } = await supabase
      .from("inbox_health")
      .update({
        is_paused: true,
        pause_reason: `Fleet Manager: ${decision.reason}`,
        paused_at: new Date().toISOString(),
      })
      .eq("inbox_id", decision.inbox_id);

    if (pauseError) {
      console.error(`Error pausing inbox ${decision.inbox_id}:`, pauseError);
    }
  } else if (decision.action === 'resume') {
    const { error: resumeError } = await supabase
      .from("inbox_health")
      .update({
        is_paused: false,
        pause_reason: null,
        paused_at: null,
      })
      .eq("inbox_id", decision.inbox_id);

    if (resumeError) {
      console.error(`Error resuming inbox ${decision.inbox_id}:`, resumeError);
    }
  }

  // Log activity
  const actionType = decision.action === 'pause' ? 'inbox_paused' :
                    decision.action === 'resume' ? 'inbox_resumed' :
                    decision.action === 'boost' ? 'inbox_boosted' :
                    decision.action === 'throttle' ? 'inbox_throttled' :
                    'cap_adjusted';

  await supabase.rpc("log_fleet_activity", {
    p_workspace_id: workspaceId,
    p_action_type: actionType,
    p_inbox_id: decision.inbox_id,
    p_domain: decision.domain,
    p_action_details: {
      current_cap: decision.current_daily_cap,
      new_cap: decision.recommended_daily_cap,
      reason: decision.reason,
      health_score: decision.health_score,
      risk_level: decision.risk_level,
    },
  });
}

async function applyDomainLevelProtection(
  workspaceId: string,
  decisions: FleetDecision[]
) {
  // Group decisions by domain
  const domainMap = new Map<string, FleetDecision[]>();
  for (const decision of decisions) {
    if (!domainMap.has(decision.domain)) {
      domainMap.set(decision.domain, []);
    }
    domainMap.get(decision.domain)!.push(decision);
  }

  // Check each domain for risks
  for (const [domain, domainDecisions] of domainMap.entries()) {
    // Get domain health
    const { data: domainHealth } = await supabase
      .from("domain_health")
      .select("*")
      .eq("domain", domain)
      .single();

    if (!domainHealth) continue;

    // Check for domain-level bounce risk
    const bounceRate = domainHealth.bounce_rate || 0;
    const spamRate = domainHealth.spam_rate || 0;

    // Get predictions for domain
    const { data: domainPrediction } = await supabase
      .from("predictions")
      .select("predicted_value, trend")
      .eq("domain", domain)
      .eq("metric", "bounce_risk")
      .eq("horizon_days", 7)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // If domain risk is high, throttle all inboxes on that domain
    if (
      bounceRate > 0.05 ||
      spamRate > 0.002 ||
      (domainPrediction && domainPrediction.predicted_value > 0.05 && domainPrediction.trend === 'increasing')
    ) {
      console.log(`Domain ${domain} has high risk. Throttling inboxes...`);

      // Reduce caps by 40% for all inboxes on this domain
      for (const decision of domainDecisions) {
        const { error: throttleError } = await supabase
          .from("inbox_limits")
          .update({
            daily_cap: Math.floor(decision.recommended_daily_cap * 0.6),
            hourly_cap: Math.floor(decision.recommended_hourly_cap * 0.6),
          })
          .eq("inbox_id", decision.inbox_id);

        if (!throttleError) {
          await supabase.rpc("log_fleet_activity", {
            p_workspace_id: workspaceId,
            p_action_type: "domain_throttled",
            p_inbox_id: decision.inbox_id,
            p_domain: domain,
            p_action_details: {
              reason: `Domain bounce risk: ${(bounceRate * 100).toFixed(2)}%, Spam risk: ${(spamRate * 100).toFixed(2)}%`,
              reduction_percent: 40,
            },
          });
        }
      }

      // Log domain-level action
      await supabase.rpc("log_fleet_activity", {
        p_workspace_id: workspaceId,
        p_action_type: "domain_rerouted",
        p_domain: domain,
        p_action_details: {
          bounce_rate: bounceRate,
          spam_rate: spamRate,
          predicted_risk: domainPrediction?.predicted_value,
          inboxes_affected: domainDecisions.length,
        },
      });
    }
  }
}

async function checkAndApplyFallbacks(
  workspaceId: string,
  decisions: FleetDecision[]
) {
  // Find paused or high-risk inboxes
  const problematicInboxes = decisions.filter(
    d => d.action === 'pause' || d.risk_level === 'high'
  );

  if (problematicInboxes.length === 0) {
    return;
  }

  // Find healthy inboxes that can take on additional load
  const healthyInboxes = decisions.filter(
    d => d.action !== 'pause' && d.risk_level === 'low' && d.health_score >= 80
  );

  if (healthyInboxes.length === 0) {
    console.log("No healthy inboxes available for fallback");
    return;
  }

  // Distribute load from problematic inboxes to healthy ones
  const loadToRedistribute = problematicInboxes.reduce(
    (sum, d) => sum + (d.current_daily_cap || 0),
    0
  );

  const loadPerHealthyInbox = Math.ceil(loadToRedistribute / healthyInboxes.length);

  for (const healthyInbox of healthyInboxes) {
    const newCap = healthyInbox.recommended_daily_cap + loadPerHealthyInbox;
    
    const { error: updateError } = await supabase
      .from("inbox_limits")
      .update({
        daily_cap: newCap,
        hourly_cap: Math.ceil(newCap / 12),
      })
      .eq("inbox_id", healthyInbox.inbox_id);

    if (!updateError) {
      await supabase.rpc("log_fleet_activity", {
        p_workspace_id: workspaceId,
        p_action_type: "fallback_applied",
        p_inbox_id: healthyInbox.inbox_id,
        p_action_details: {
          reason: `Taking load from ${problematicInboxes.length} problematic inbox(es)`,
          additional_capacity: loadPerHealthyInbox,
          new_cap: newCap,
        },
      });
    }
  }

  // Log fallback for each problematic inbox
  for (const problematicInbox of problematicInboxes) {
    await supabase.rpc("log_fleet_activity", {
      p_workspace_id: workspaceId,
      p_action_type: "fallback_applied",
      p_inbox_id: problematicInbox.inbox_id,
      p_domain: problematicInbox.domain,
      p_action_details: {
        reason: `Inbox paused/high-risk. Load redistributed to ${healthyInboxes.length} healthy inbox(es)`,
        fallback_inboxes: healthyInboxes.map(h => h.email),
      },
    });
  }
}

