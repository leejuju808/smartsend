// Block 452 — Deliverability Analyzer Edge Function
// AI-powered deliverability analysis and safety score calculation

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface DeliverabilityAnalysisInput {
  inbox_id?: string;
  domain?: string;
  last_24h_stats?: {
    sent: number;
    bounced: number;
    spam: number;
    opened: number;
    replied: number;
    unsubscribed: number;
  };
}

interface DeliverabilityAnalysisOutput {
  send_safety_score: number; // 0-100
  recommended_throttle: number; // emails/hour
  should_pause: boolean;
  pause_reason: string | null;
  notes: string[];
}

Deno.serve(async (req) => {
  try {
    const { inbox_id, domain, last_24h_stats } = await req.json() as DeliverabilityAnalysisInput;

    if (!inbox_id && !domain) {
      return new Response(
        JSON.stringify({ error: "Either inbox_id or domain is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    let analysis: DeliverabilityAnalysisOutput;

    if (inbox_id) {
      analysis = await analyzeInbox(inbox_id, last_24h_stats);
    } else {
      analysis = await analyzeDomain(domain!, last_24h_stats);
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("Deliverability analyzer error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function analyzeInbox(
  inboxId: string,
  providedStats?: DeliverabilityAnalysisInput["last_24h_stats"]
): Promise<DeliverabilityAnalysisOutput> {
  // Get inbox health
  const { data: health, error: healthError } = await supabase
    .from("inbox_health")
    .select("*")
    .eq("inbox_id", inboxId)
    .single();

  if (healthError && healthError.code !== "PGRST116") {
    throw healthError;
  }

  // Use provided stats or fetch from health record
  const stats = providedStats || {
    sent: health?.last_24h_sent || 0,
    bounced: health?.last_24h_bounced || 0,
    spam: health?.last_24h_spam || 0,
    opened: health?.last_24h_opened || 0,
    replied: health?.last_24h_replied || 0,
    unsubscribed: health?.last_24h_unsubscribed || 0,
  };

  // Calculate rates
  const bounceRate = stats.sent > 0 ? stats.bounced / stats.sent : 0;
  const spamRate = stats.sent > 0 ? stats.spam / stats.sent : 0;
  const openRate = stats.sent > 0 ? stats.opened / stats.sent : 0;
  const replyRate = stats.sent > 0 ? stats.replied / stats.sent : 0;
  const unsubscribeRate = stats.sent > 0 ? stats.unsubscribed / stats.sent : 0;

  // Get inbox warmup status
  const { data: inbox } = await supabase
    .from("sender_inboxes")
    .select("warmup_enabled")
    .eq("id", inboxId)
    .single();

  const isWarmed = inbox?.warmup_enabled || false;

  // Calculate safety score
  let safetyScore = 100;
  const notes: string[] = [];
  let shouldPause = false;
  let pauseReason: string | null = null;

  // Negative signals (penalties)
  if (bounceRate > 0.08) {
    safetyScore -= 50;
    shouldPause = true;
    pauseReason = "Bounce rate > 8% (24h)";
    notes.push("Critical: Bounce rate exceeds 8% threshold");
  } else if (bounceRate > 0.06) {
    safetyScore -= 35;
    notes.push("Warning: Bounce rate > 6%");
  } else if (bounceRate > 0.04) {
    safetyScore -= 15;
    notes.push("Caution: Bounce rate > 4%");
  }

  if (spamRate > 0.003) {
    safetyScore -= 50;
    shouldPause = true;
    pauseReason = pauseReason || "Spam rate > 0.3% (24h)";
    notes.push("Critical: Spam rate exceeds 0.3% threshold");
  } else if (spamRate > 0.002) {
    safetyScore -= 25;
    notes.push("Warning: Spam rate > 0.2%");
  } else if (spamRate > 0.001) {
    safetyScore -= 10;
    notes.push("Caution: Spam rate > 0.1%");
  }

  if (unsubscribeRate > 0.02) {
    safetyScore -= 20;
    notes.push("Warning: Unsubscribe rate > 2%");
  } else if (unsubscribeRate > 0.01) {
    safetyScore -= 10;
    notes.push("Caution: Unsubscribe rate > 1%");
  }

  // Positive signals (bonuses)
  if (openRate > 0.35) {
    safetyScore += 10;
    notes.push("Positive: Open rate > 35%");
  }

  if (replyRate > 0.015) {
    safetyScore += 10;
    notes.push("Positive: Reply rate > 1.5%");
  }

  if (isWarmed) {
    safetyScore += 15;
    notes.push("Positive: Domain is warmed");
  }

  // Clamp score to 0-100
  safetyScore = Math.max(0, Math.min(100, safetyScore));

  // Calculate recommended throttle based on safety score
  let recommendedThrottle: number;
  if (shouldPause || safetyScore < 30) {
    recommendedThrottle = 0;
  } else if (safetyScore < 50) {
    recommendedThrottle = 10; // Slow down
  } else if (safetyScore < 80) {
    recommendedThrottle = 30; // Moderate rate
  } else {
    recommendedThrottle = 50; // Normal rate
  }

  // Add trend analysis notes
  if (stats.sent < 10) {
    notes.push("Note: Low send volume (need more data for accurate analysis)");
  }

  if (bounceRate > 0 && bounceRate < 0.02) {
    notes.push("Good: Bounce rate within acceptable range");
  }

  if (spamRate === 0 && stats.sent > 0) {
    notes.push("Excellent: No spam complaints detected");
  }

  return {
    send_safety_score: safetyScore,
    recommended_throttle: recommendedThrottle,
    should_pause: shouldPause,
    pause_reason: pauseReason,
    notes,
  };
}

async function analyzeDomain(
  domain: string,
  providedStats?: DeliverabilityAnalysisInput["last_24h_stats"]
): Promise<DeliverabilityAnalysisOutput> {
  // Get domain health
  const { data: health, error: healthError } = await supabase
    .from("domain_health")
    .select("*")
    .eq("domain", domain)
    .single();

  if (healthError && healthError.code !== "PGRST116") {
    throw healthError;
  }

  // Use provided stats or fetch from health record
  const stats = providedStats || {
    sent: health?.last_24h_sent || 0,
    bounced: health?.last_24h_bounced || 0,
    spam: health?.last_24h_spam || 0,
    opened: health?.last_24h_opened || 0,
    replied: 0,
    unsubscribed: 0,
  };

  // Calculate rates
  const bounceRate = stats.sent > 0 ? stats.bounced / stats.sent : 0;
  const spamRate = stats.sent > 0 ? stats.spam / stats.sent : 0;
  const openRate = stats.sent > 0 ? stats.opened / stats.sent : 0;

  // Calculate safety score (similar to inbox but domain-level)
  let safetyScore = 100;
  const notes: string[] = [];
  let shouldPause = false;
  let pauseReason: string | null = null;

  // Negative signals
  if (bounceRate > 0.08) {
    safetyScore -= 50;
    shouldPause = true;
    pauseReason = "Domain bounce rate > 8% (24h)";
    notes.push("Critical: Domain bounce rate exceeds 8% threshold");
  } else if (bounceRate > 0.06) {
    safetyScore -= 35;
    notes.push("Warning: Domain bounce rate > 6%");
  } else if (bounceRate > 0.04) {
    safetyScore -= 15;
    notes.push("Caution: Domain bounce rate > 4%");
  }

  if (spamRate > 0.003) {
    safetyScore -= 50;
    shouldPause = true;
    pauseReason = pauseReason || "Domain spam rate > 0.3% (24h)";
    notes.push("Critical: Domain spam rate exceeds 0.3% threshold");
  } else if (spamRate > 0.002) {
    safetyScore -= 25;
    notes.push("Warning: Domain spam rate > 0.2%");
  } else if (spamRate > 0.001) {
    safetyScore -= 10;
    notes.push("Caution: Domain spam rate > 0.1%");
  }

  // Positive signals
  if (openRate > 0.35) {
    safetyScore += 10;
    notes.push("Positive: Domain open rate > 35%");
  }

  // Clamp score
  safetyScore = Math.max(0, Math.min(100, safetyScore));

  // Calculate recommended throttle
  let recommendedThrottle: number;
  if (shouldPause || safetyScore < 30) {
    recommendedThrottle = 0;
  } else if (safetyScore < 50) {
    recommendedThrottle = 10;
  } else if (safetyScore < 80) {
    recommendedThrottle = 30;
  } else {
    recommendedThrottle = 50;
  }

  // Get sender count
  const { data: domainData } = await supabase
    .from("sender_domains")
    .select("id")
    .eq("domain", domain)
    .single();

  if (domainData) {
    const { count } = await supabase
      .from("sender_inboxes")
      .select("*", { count: "exact", head: true })
      .eq("domain_id", domainData.id);

    if (count && count > 1) {
      notes.push(`Domain has ${count} active senders`);
    }
  }

  return {
    send_safety_score: safetyScore,
    recommended_throttle: recommendedThrottle,
    should_pause: shouldPause,
    pause_reason: pauseReason,
    notes,
  };
}

