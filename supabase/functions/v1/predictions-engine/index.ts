import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface PredictionInput {
  workspace_id: string;
  past_90_days_events?: any[];
  step_stats?: any[];
  variant_stats?: any[];
  inbox_health?: any[];
  domain_health?: any[];
  reply_intent_distribution?: any[];
  revenue_attribution?: any[];
  warmup_data?: any[];
  sending_velocity?: any[];
  icp_performance?: any[];
  deliverability_signals?: any[];
}

interface Prediction {
  workspace_id: string;
  campaign_id?: string;
  step_id?: string;
  inbox_id?: string;
  domain?: string;
  metric: string;
  predicted_value: number;
  confidence: number;
  horizon_days: number;
  lower_bound?: number;
  upper_bound?: number;
  trend?: 'increasing' | 'stable' | 'declining';
  metadata?: Record<string, any>;
}

Deno.serve(async () => {
  try {
    console.log("Starting predictions engine...");

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
        await generatePredictionsForWorkspace(workspace.id);
        processed++;
      } catch (e) {
        console.error(`Error processing workspace ${workspace.id}:`, e);
        errors.push(`Workspace ${workspace.id}: ${String(e)}`);
      }
    }

    // Cleanup old predictions
    try {
      const { error: cleanupError } = await supabase.rpc("cleanup_old_predictions");
      if (cleanupError) {
        console.error("Error cleaning up old predictions:", cleanupError);
      }
    } catch (e) {
      console.error("Error in cleanup:", e);
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
    console.error("Fatal error in predictions engine:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function generatePredictionsForWorkspace(workspaceId: string) {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const now = new Date();

  // Get campaigns first to filter other queries
  const { data: workspaceCampaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);
  const campaignIds = workspaceCampaigns?.map(c => c.id) || [];

  // Get sequences for steps
  const { data: workspaceSequences } = await supabase
    .from("sequences")
    .select("id")
    .eq("workspace_id", workspaceId);
  const sequenceIds = workspaceSequences?.map(s => s.id) || [];

  // Gather historical data
  const [
    emailEvents,
    campaigns,
    steps,
    inboxes,
    domains,
    replies,
  ] = await Promise.all([
    // Email events (opens, clicks, bounces)
    (() => {
      let query = supabase
        .from("email_events")
        .select("*")
        .gte("created_at", ninetyDaysAgo.toISOString());
      if (campaignIds.length > 0) {
        query = query.in("campaign_id", campaignIds);
      }
      return query.order("created_at", { ascending: false });
    })(),

    // Campaigns
    supabase
      .from("campaigns")
      .select("id, name, workspace_id")
      .eq("workspace_id", workspaceId),

    // Sequence steps
    (() => {
      let query = supabase
        .from("sequence_steps")
        .select("id, sequence_id, position, subject");
      if (sequenceIds.length > 0) {
        query = query.in("sequence_id", sequenceIds);
      } else {
        query = query.eq("sequence_id", "00000000-0000-0000-0000-000000000000"); // Return empty
      }
      return query;
    })(),

    // Inboxes
    supabase
      .from("sender_inboxes")
      .select("id, email, domain_id, workspace_id")
      .eq("workspace_id", workspaceId),

    // Domains
    supabase
      .from("sender_domains")
      .select("domain, workspace_id")
      .eq("workspace_id", workspaceId),

    // Replies with intent
    (() => {
      let query = supabase
        .from("email_replies")
        .select("id, campaign_id, lead_id, intent, created_at")
        .gte("created_at", ninetyDaysAgo.toISOString());
      if (campaignIds.length > 0) {
        query = query.in("campaign_id", campaignIds);
      } else {
        query = query.eq("campaign_id", "00000000-0000-0000-0000-000000000000"); // Return empty
      }
      return query;
    })(),
  ]);

  const predictions: Prediction[] = [];

  // 1. Generate workspace-level predictions
  predictions.push(...await generateWorkspacePredictions(workspaceId, emailEvents.data || [], replies.data || []));

  // 2. Generate campaign-level predictions
  for (const campaign of campaigns.data || []) {
    predictions.push(...await generateCampaignPredictions(
      workspaceId,
      campaign.id,
      emailEvents.data?.filter(e => e.campaign_id === campaign.id) || [],
      replies.data?.filter(r => r.campaign_id === campaign.id) || []
    ));
  }

  // 3. Generate step-level predictions
  for (const step of steps.data || []) {
    predictions.push(...await generateStepPredictions(
      workspaceId,
      step.sequence_id,
      step.id,
      emailEvents.data || [],
      replies.data || []
    ));
  }

  // 4. Generate inbox risk predictions
  for (const inbox of inboxes.data || []) {
    predictions.push(...await generateInboxRiskPredictions(
      workspaceId,
      inbox.id,
      emailEvents.data?.filter(e => e.inbox_id === inbox.id) || []
    ));
  }

  // 5. Generate domain risk predictions
  for (const domain of domains.data || []) {
    predictions.push(...await generateDomainRiskPredictions(
      workspaceId,
      domain.domain,
      emailEvents.data || []
    ));
  }

  // 6. Generate revenue projections
  predictions.push(...await generateRevenuePredictions(workspaceId, replies.data || []));

  // Insert all predictions
  if (predictions.length > 0) {
    const { error: insertError } = await supabase
      .from("predictions")
      .insert(predictions);

    if (insertError) {
      console.error(`Error inserting predictions for workspace ${workspaceId}:`, insertError);
      throw insertError;
    }
  }

  // Generate alerts based on predictions
  await generatePredictionAlerts(workspaceId, predictions);

  console.log(`Generated ${predictions.length} predictions for workspace ${workspaceId}`);
}

async function generateWorkspacePredictions(
  workspaceId: string,
  events: any[],
  replies: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Calculate historical rates
  const sent = events.filter(e => e.event_type === 'sent' || e.event_type === 'delivered').length;
  const opened = events.filter(e => e.event_type === 'opened').length;
  const replied = replies.length;
  const interested = replies.filter(r => r.intent === 'interested' || r.intent === 'meeting').length;

  const openRate = sent > 0 ? opened / sent : 0;
  const replyRate = sent > 0 ? replied / sent : 0;
  const interestedRate = sent > 0 ? interested / sent : 0;

  // Simple time-series forecast (moving average with trend)
  const recent30Days = events.filter(e => {
    const eventDate = new Date(e.created_at);
    return eventDate >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  });
  const recentSent = recent30Days.filter(e => e.event_type === 'sent' || e.event_type === 'delivered').length;
  const recentOpened = recent30Days.filter(e => e.event_type === 'opened').length;
  const recentReplied = replies.filter(r => {
    const replyDate = new Date(r.created_at);
    return replyDate >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }).length;

  const recentOpenRate = recentSent > 0 ? recentOpened / recentSent : 0;
  const recentReplyRate = recentSent > 0 ? recentReplied / recentSent : 0;

  // Forecast next 30 days
  const trend = recentOpenRate > openRate * 1.05 ? 'increasing' : 
                recentOpenRate < openRate * 0.95 ? 'declining' : 'stable';

  const predictedOpenRate = recentOpenRate || openRate;
  const predictedReplyRate = recentReplyRate || replyRate;

  // Confidence based on data volume
  const confidence = Math.min(0.95, Math.max(0.3, Math.log10(sent + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    metric: 'open_rate',
    predicted_value: predictedOpenRate * 100,
    confidence,
    horizon_days: 30,
    lower_bound: predictedOpenRate * 0.9 * 100,
    upper_bound: predictedOpenRate * 1.1 * 100,
    trend,
  });

  predictions.push({
    workspace_id: workspaceId,
    metric: 'reply_rate',
    predicted_value: predictedReplyRate * 100,
    confidence,
    horizon_days: 30,
    lower_bound: predictedReplyRate * 0.85 * 100,
    upper_bound: predictedReplyRate * 1.15 * 100,
    trend: recentReplyRate > replyRate * 1.05 ? 'increasing' : 
           recentReplyRate < replyRate * 0.95 ? 'declining' : 'stable',
  });

  // Interested replies forecast
  const avgInterestedPerDay = interested / 90;
  const predictedInterested = avgInterestedPerDay * 30;

  predictions.push({
    workspace_id: workspaceId,
    metric: 'interested',
    predicted_value: predictedInterested,
    confidence: confidence * 0.8,
    horizon_days: 30,
    lower_bound: predictedInterested * 0.7,
    upper_bound: predictedInterested * 1.4,
  });

  return predictions;
}

async function generateCampaignPredictions(
  workspaceId: string,
  campaignId: string,
  events: any[],
  replies: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  const sent = events.filter(e => e.event_type === 'sent' || e.event_type === 'delivered').length;
  const opened = events.filter(e => e.event_type === 'opened').length;
  const replied = replies.length;

  if (sent === 0) return predictions;

  const openRate = opened / sent;
  const replyRate = replied / sent;

  const confidence = Math.min(0.9, Math.max(0.4, Math.log10(sent + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    campaign_id: campaignId,
    metric: 'open_rate',
    predicted_value: openRate * 100,
    confidence,
    horizon_days: 30,
    lower_bound: openRate * 0.85 * 100,
    upper_bound: openRate * 1.15 * 100,
    trend: 'stable',
  });

  predictions.push({
    workspace_id: workspaceId,
    campaign_id: campaignId,
    metric: 'reply_rate',
    predicted_value: replyRate * 100,
    confidence,
    horizon_days: 30,
    lower_bound: replyRate * 0.8 * 100,
    upper_bound: replyRate * 1.2 * 100,
    trend: 'stable',
  });

  return predictions;
}

async function generateStepPredictions(
  workspaceId: string,
  sequenceId: string,
  stepId: string,
  events: any[],
  replies: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Filter events for this step (would need step_id in events table)
  // For now, use a simplified approach
  const stepEvents = events; // Placeholder - would filter by step_id if available
  const sent = stepEvents.filter(e => e.event_type === 'sent' || e.event_type === 'delivered').length;
  const opened = stepEvents.filter(e => e.event_type === 'opened').length;

  if (sent === 0) return predictions;

  const openRate = opened / sent;
  const confidence = Math.min(0.85, Math.max(0.3, Math.log10(sent + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    step_id: stepId,
    metric: 'open_rate',
    predicted_value: openRate * 100,
    confidence,
    horizon_days: 30,
    lower_bound: openRate * 0.8 * 100,
    upper_bound: openRate * 1.2 * 100,
    trend: 'stable',
  });

  return predictions;
}

async function generateInboxRiskPredictions(
  workspaceId: string,
  inboxId: string,
  events: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Note: email_events may not have inbox_id, so we'll use a simplified approach
  // In production, you'd join through send_logs or email_messages tables
  const inboxEvents = events; // Placeholder - would filter by inbox_id if available
  const sent = inboxEvents.filter(e => 
    e.event_type === 'sent' || e.event_type === 'delivered' || e.event_type === 'open'
  ).length;
  const bounced = inboxEvents.filter(e => e.event_type === 'bounced').length;
  const spam = inboxEvents.filter(e => e.event_type === 'complained' || e.event_type === 'spam').length;

  if (sent === 0) return predictions;

  const bounceRate = bounced / sent;
  const spamRate = spam / sent;

  // Forecast next 7 days
  const predictedBounceRate = bounceRate;
  const predictedSpamRate = spamRate;

  const confidence = Math.min(0.8, Math.max(0.3, Math.log10(sent + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    inbox_id: inboxId,
    metric: 'bounce_risk',
    predicted_value: predictedBounceRate * 100,
    confidence,
    horizon_days: 7,
    lower_bound: predictedBounceRate * 0.7 * 100,
    upper_bound: predictedBounceRate * 1.3 * 100,
    trend: bounceRate > 0.05 ? 'declining' : 'stable',
  });

  predictions.push({
    workspace_id: workspaceId,
    inbox_id: inboxId,
    metric: 'spam_risk',
    predicted_value: predictedSpamRate * 100,
    confidence,
    horizon_days: 7,
    lower_bound: predictedSpamRate * 0.7 * 100,
    upper_bound: predictedSpamRate * 1.3 * 100,
    trend: spamRate > 0.01 ? 'declining' : 'stable',
  });

  return predictions;
}

async function generateDomainRiskPredictions(
  workspaceId: string,
  domain: string,
  events: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Filter events by domain (would need domain extraction from from_email or join with send_logs)
  // For now, use all events as placeholder
  const domainEvents = events; // Placeholder - would filter by domain if available
  const sent = domainEvents.filter(e => 
    e.event_type === 'sent' || e.event_type === 'delivered' || e.event_type === 'open'
  ).length;
  const bounced = domainEvents.filter(e => e.event_type === 'bounced').length;
  const spam = domainEvents.filter(e => e.event_type === 'complained' || e.event_type === 'spam').length;

  if (sent === 0) return predictions;

  const bounceRate = bounced / sent;
  const spamRate = spam / sent;

  const confidence = Math.min(0.75, Math.max(0.3, Math.log10(sent + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    domain,
    metric: 'bounce_risk',
    predicted_value: bounceRate * 100,
    confidence,
    horizon_days: 7,
    lower_bound: bounceRate * 0.7 * 100,
    upper_bound: bounceRate * 1.3 * 100,
    trend: bounceRate > 0.05 ? 'declining' : 'stable',
  });

  predictions.push({
    workspace_id: workspaceId,
    domain,
    metric: 'spam_risk',
    predicted_value: spamRate * 100,
    confidence,
    horizon_days: 7,
    lower_bound: spamRate * 0.7 * 100,
    upper_bound: spamRate * 1.3 * 100,
    trend: spamRate > 0.01 ? 'declining' : 'stable',
  });

  return predictions;
}

async function generateRevenuePredictions(
  workspaceId: string,
  replies: any[]
): Promise<Prediction[]> {
  const predictions: Prediction[] = [];

  // Simple revenue projection based on interested replies
  // In a real system, this would use deal velocity, win rates, average deal size
  const interestedReplies = replies.filter(r => 
    r.intent === 'interested' || r.intent === 'meeting'
  ).length;

  // Estimate: 30% of interested replies convert to deals
  // Average deal size: $5,000 (placeholder - would come from CRM/deals table)
  const avgDealSize = 5000;
  const conversionRate = 0.3;
  
  const deals30Days = interestedReplies * conversionRate;
  const revenue30Days = deals30Days * avgDealSize;

  const deals90Days = deals30Days * 3;
  const revenue90Days = deals90Days * avgDealSize;

  const confidence = Math.min(0.7, Math.max(0.3, Math.log10(interestedReplies + 1) / 3));

  predictions.push({
    workspace_id: workspaceId,
    metric: 'revenue',
    predicted_value: revenue30Days,
    confidence,
    horizon_days: 30,
    lower_bound: revenue30Days * 0.55,
    upper_bound: revenue30Days * 1.8,
  });

  predictions.push({
    workspace_id: workspaceId,
    metric: 'revenue',
    predicted_value: revenue90Days,
    confidence: confidence * 0.9,
    horizon_days: 90,
    lower_bound: revenue90Days * 0.5,
    upper_bound: revenue90Days * 2.0,
  });

  return predictions;
}

async function generatePredictionAlerts(
  workspaceId: string,
  predictions: Prediction[]
): Promise<void> {
  const alerts: any[] = [];

  for (const pred of predictions) {
    // Alert on high bounce risk
    if (pred.metric === 'bounce_risk' && pred.predicted_value > 5) {
      alerts.push({
        workspace_id: workspaceId,
        alert_type: pred.inbox_id ? 'inbox_risk' : 'domain_risk',
        severity: pred.predicted_value > 10 ? 'critical' : pred.predicted_value > 7 ? 'high' : 'medium',
        title: `${pred.inbox_id ? 'Inbox' : 'Domain'} bounce risk exceeds threshold`,
        message: `Predicted bounce rate: ${pred.predicted_value.toFixed(2)}% over next ${pred.horizon_days} days`,
        entity_type: pred.inbox_id ? 'inbox' : 'domain',
        entity_id: pred.inbox_id || null,
        entity_name: pred.domain || null,
        recommendation: 'Consider slowing sending or reviewing content quality',
        prediction_id: pred.id,
      });
    }

    // Alert on high spam risk
    if (pred.metric === 'spam_risk' && pred.predicted_value > 0.15) {
      alerts.push({
        workspace_id: workspaceId,
        alert_type: pred.inbox_id ? 'inbox_risk' : 'domain_risk',
        severity: pred.predicted_value > 0.3 ? 'critical' : 'high',
        title: `${pred.inbox_id ? 'Inbox' : 'Domain'} spam risk exceeds threshold`,
        message: `Predicted spam rate: ${pred.predicted_value.toFixed(2)}% over next ${pred.horizon_days} days`,
        entity_type: pred.inbox_id ? 'inbox' : 'domain',
        entity_id: pred.inbox_id || null,
        entity_name: pred.domain || null,
        recommendation: 'Review content and sending practices. Consider auto-throttle.',
        prediction_id: pred.id,
      });
    }

    // Alert on declining step performance
    if (pred.metric === 'open_rate' && pred.step_id && pred.trend === 'declining') {
      alerts.push({
        workspace_id: workspaceId,
        alert_type: 'step_performance',
        severity: 'medium',
        title: 'Step performance declining',
        message: `Step ${pred.step_id} open rate expected to drop by ${(pred.predicted_value * 0.1).toFixed(1)}%`,
        entity_type: 'step',
        entity_id: pred.step_id,
        recommendation: 'Consider rewriting subject using AI Rewriter',
        prediction_id: pred.id,
      });
    }
  }

  if (alerts.length > 0) {
    const { error } = await supabase
      .from("prediction_alerts")
      .insert(alerts);

    if (error) {
      console.error("Error inserting prediction alerts:", error);
    }
  }
}

