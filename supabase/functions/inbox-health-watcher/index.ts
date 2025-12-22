// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1/chat/completions";

Deno.serve(async () => {
  try {
    console.log("Starting inbox health watcher...");

    // Get all connected inboxes
    const { data: inboxes, error: inboxError } = await supabase
      .from("sender_inboxes")
      .select("id, email, domain_id, workspace_id, warmup_enabled, connected, created_at")
      .eq("connected", true);

    if (inboxError) {
      console.error("Error fetching inboxes:", inboxError);
      return new Response(JSON.stringify({ error: inboxError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${inboxes?.length || 0} inboxes`);

    // Process each inbox
    for (const inbox of inboxes || []) {
      await processInboxHealth(inbox);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: inboxes?.length || 0 }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in inbox-health-watcher:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function processInboxHealth(inbox: any) {
  console.log(`Processing inbox ${inbox.id} (${inbox.email})`);

  // Get last 7 days of email events
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: events, error: eventsError } = await supabase
    .from("email_events")
    .select("event_type, created_at")
    .eq("sender_inbox_id", inbox.id)
    .gte("created_at", sevenDaysAgo.toISOString());

  if (eventsError) {
    console.error(`Error fetching events for inbox ${inbox.id}:`, eventsError);
    return;
  }

  // Calculate metrics
  const sends = (events || []).filter((e: any) => 
    e.event_type === 'sent' || e.event_type === 'delivered'
  ).length;
  
  const bounces = (events || []).filter((e: any) => 
    e.event_type === 'bounce' || e.event_type === 'bounced'
  ).length;
  
  const spam = (events || []).filter((e: any) => 
    e.event_type === 'spam' || e.event_type === 'complained' || e.event_type === 'complaint'
  ).length;
  
  const opens = (events || []).filter((e: any) => 
    e.event_type === 'open' || e.event_type === 'opened'
  ).length;
  
  const replies = (events || []).filter((e: any) => 
    e.event_type === 'reply' || e.event_type === 'replied'
  ).length;

  // Calculate rates
  const bounceRate = sends > 0 ? bounces / sends : 0;
  const spamRate = sends > 0 ? spam / sends : 0;
  const openRate = sends > 0 ? opens / sends : 0;
  const replyRate = sends > 0 ? replies / sends : 0;

  // Get previous week's sends for volume spike detection
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const sevenDaysAgoDate = new Date();
  sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);

  const { count: prevWeekSends } = await supabase
    .from("email_events")
    .select("*", { count: "exact", head: true })
    .eq("sender_inbox_id", inbox.id)
    .gte("created_at", fourteenDaysAgo.toISOString())
    .lt("created_at", sevenDaysAgoDate.toISOString())
    .in("event_type", ["sent", "delivered"]);

  const volumeSpike = prevWeekSends && prevWeekSends > 0 && sends >= prevWeekSends * 2;

  // Get domain reputation
  const { data: domainRep } = await supabase
    .from("domain_reputation")
    .select("reputation_score")
    .eq("domain_id", inbox.domain_id)
    .single();

  const domainReputation = domainRep?.reputation_score || 50;

  // Get warmup stage
  const { data: currentHealth } = await supabase
    .from("inbox_health")
    .select("warmup_stage")
    .eq("inbox_id", inbox.id)
    .single();

  const warmupStage = currentHealth?.warmup_stage || 0;
  const isInWarmup = inbox.warmup_enabled && warmupStage > 0;

  // Calculate inbox age in days
  const inboxAge = Math.floor(
    (new Date().getTime() - new Date(inbox.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Calculate health score
  let healthScore = 100;

  // Bounce Rate Penalties
  if (bounceRate >= 0.10) {
    healthScore -= 50;
  } else if (bounceRate >= 0.05) {
    healthScore -= 30;
  } else if (bounceRate >= 0.02) {
    healthScore -= 10;
  }

  // Spam Complaint Penalties
  if (spamRate >= 0.003) {
    healthScore -= 70;
  } else if (spamRate >= 0.001) {
    healthScore -= 30;
  }

  // Open Rate Penalties
  if (openRate < 0.10) {
    healthScore -= 40;
  } else if (openRate < 0.20) {
    healthScore -= 20;
  }

  // Reply Rate Penalties
  if (replyRate < 0.005) {
    healthScore -= 20;
  } else if (replyRate < 0.01) {
    healthScore -= 10;
  }

  // Volume Spike Penalties
  if (volumeSpike) {
    healthScore -= 10;
  }

  // Warmup Recovery Bonus
  if (isInWarmup) {
    healthScore += 10;
  }

  // Clamp score
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Prepare health data for AI analysis
  const healthData = {
    inbox_id: inbox.id,
    email: inbox.email,
    bounce_rate: bounceRate,
    spam_rate: spamRate,
    open_rate: openRate,
    reply_rate: replyRate,
    last_7_day_sends: sends,
    last_7_day_bounces: bounces,
    last_7_day_spam: spam,
    last_7_day_opens: opens,
    last_7_day_replies: replies,
    domain_reputation: domainReputation,
    warmup_stage: warmupStage,
    inbox_age_days: inboxAge,
    health_score: healthScore,
  };

  // Call AI analyzer
  let aiAnalysis: any = null;
  if (OPENAI_API_KEY) {
    try {
      aiAnalysis = await analyzeInboxHealth(healthData);
    } catch (aiError: any) {
      console.error(`AI analysis failed for inbox ${inbox.id}:`, aiError);
      // Continue without AI analysis
    }
  }

  // Update inbox_health table
  const { error: upsertError } = await supabase
    .from("inbox_health")
    .upsert({
      inbox_id: inbox.id,
      health_score: Math.round(healthScore),
      bounce_rate: bounceRate,
      spam_rate: spamRate,
      open_rate: openRate,
      reply_rate: replyRate,
      last_7_day_sends: sends,
      last_7_day_bounces: bounces,
      last_7_day_spam: spam,
      last_7_day_opens: opens,
      last_7_day_replies: replies,
      warmup_stage: warmupStage,
      flagged: aiAnalysis?.status === 'critical' || healthScore < 40,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    console.error(`Error upserting inbox_health for ${inbox.id}:`, upsertError);
  }

  // Auto-disable unhealthy inboxes if AI recommends it
  if (aiAnalysis?.disable_inbox === true) {
    await supabase
      .from("sender_inboxes")
      .update({
        connected: false,
        disabled_reason: 'AI: reputation critical',
      })
      .eq("id", inbox.id);

    // Create alert
    await supabase
      .from("inbox_alerts")
      .insert({
        inbox_id: inbox.id,
        alert_type: 'inbox_disabled',
        message: `Inbox auto-disabled due to critical reputation issues. ${aiAnalysis.recommendations?.join(' ') || ''}`,
      });
  }

  // Create alerts for detected issues
  await createAlerts(inbox.id, {
    bounceRate,
    spamRate,
    openRate,
    healthScore,
    volumeSpike,
    aiAnalysis,
  });
}

async function analyzeInboxHealth(healthData: any): Promise<any> {
  const prompt = `You are an email deliverability expert.

Analyze this inbox health data:

${JSON.stringify(healthData, null, 2)}

Return a JSON object with:
{
  "status": "healthy" | "warning" | "critical",
  "disable_inbox": boolean,
  "recommendations": [string array],
  "suggested_warmup_stage": number
}

Consider:
- Bounce rate > 10% is critical
- Spam rate > 0.3% is critical
- Open rate < 10% indicates deliverability issues
- Reply rate < 0.5% may indicate poor engagement
- Domain reputation affects inbox health
- Warmup stage should be recommended if inbox is new or has issues`;

  const response = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an email deliverability expert. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "{}";
  
  try {
    return JSON.parse(content);
  } catch {
    return {
      status: "warning",
      disable_inbox: false,
      recommendations: ["Unable to parse AI analysis"],
      suggested_warmup_stage: 0,
    };
  }
}

async function createAlerts(
  inboxId: string,
  metrics: {
    bounceRate: number;
    spamRate: number;
    openRate: number;
    healthScore: number;
    volumeSpike: boolean;
    aiAnalysis: any;
  }
) {
  const alerts: Array<{ alert_type: string; message: string }> = [];

  // Bounce spike detection
  if (metrics.bounceRate >= 0.10) {
    alerts.push({
      alert_type: "bounce_spike",
      message: `Critical bounce rate detected: ${(metrics.bounceRate * 100).toFixed(2)}%`,
    });
  } else if (metrics.bounceRate >= 0.05) {
    alerts.push({
      alert_type: "bounce_spike",
      message: `High bounce rate detected: ${(metrics.bounceRate * 100).toFixed(2)}%`,
    });
  }

  // Spam spike detection
  if (metrics.spamRate >= 0.003) {
    alerts.push({
      alert_type: "spam_spike",
      message: `Critical spam complaint rate: ${(metrics.spamRate * 100).toFixed(3)}%`,
    });
  } else if (metrics.spamRate >= 0.001) {
    alerts.push({
      alert_type: "spam_spike",
      message: `Elevated spam complaint rate: ${(metrics.spamRate * 100).toFixed(3)}%`,
    });
  }

  // Open rate crash detection
  if (metrics.openRate < 0.10) {
    alerts.push({
      alert_type: "open_rate_crash",
      message: `Open rate critically low: ${(metrics.openRate * 100).toFixed(2)}%`,
    });
  }

  // Deliverability drop
  if (metrics.healthScore < 40) {
    alerts.push({
      alert_type: "deliverability_drop",
      message: `Health score critically low: ${metrics.healthScore}/100`,
    });
  }

  // Warmup recommendation from AI
  if (metrics.aiAnalysis?.suggested_warmup_stage > 0) {
    alerts.push({
      alert_type: "warmup_required",
      message: `AI recommends warmup stage ${metrics.aiAnalysis.suggested_warmup_stage}: ${metrics.aiAnalysis.recommendations?.join(' ') || ''}`,
    });
  }

  // Create alerts (only create if not already exists for this inbox)
  for (const alert of alerts) {
    // Check if alert already exists (not resolved)
    const { data: existing } = await supabase
      .from("inbox_alerts")
      .select("id")
      .eq("inbox_id", inboxId)
      .eq("alert_type", alert.alert_type)
      .eq("resolved", false)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("inbox_alerts").insert({
        inbox_id: inboxId,
        alert_type: alert.alert_type,
        message: alert.message,
      });
    }
  }
}

