// Block 21380 — SmartSend Roofing Job Health Score v1
// Health Score Formula Engine (Backend Logic)
// Calculates a 0-100 health score for roofing job opportunities based on engagement, intent, follow-up, and timeliness
// Block 21381 — Adds storage and RPC integration
// Block 21386 — Adds health timeline/storyline logging
// Block 21392 — Adds HOT lead push notifications

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Interface for the data required to calculate the health score
 */
export interface RoofingJobHealthScoreData {
  // Engagement signals
  opened?: boolean;
  clicked?: boolean;
  replied?: boolean;
  replied_with_intent?: boolean;
  
  // Intent level
  intent?: "need_estimate_this_week" | "shopping_around" | "maybe_later" | "not_now" | string;
  
  // Follow-up status
  followup_sent?: boolean;
  replied_after_followup?: boolean;
  
  // Timeliness (hours since reply)
  reply_hours?: number | null;
}

/**
 * Result of health score calculation including breakdown
 */
export interface HealthScoreResult {
  health_score: number;
  breakdown: {
    engagement: number;
    intent: number;
    follow_up: number;
    timeliness: number;
  };
}

/**
 * Calculates the Roofing Job Health Score (0-100) based on engagement, intent, follow-up, and timeliness
 * 
 * Scoring buckets:
 * 1. Engagement Signals (0-40 points)
 *    - Opened email (10)
 *    - Clicked link (20)
 *    - Replied (30)
 *    - Replied with intent (40)
 * 
 * 2. Roofing Intent Level (0-30 points)
 *    - "Need estimate this week" (30)
 *    - "Shopping around" (20)
 *    - "Maybe later" (10)
 *    - "Not now" (0)
 * 
 * 3. Follow-Up Status (0-20 points)
 *    - Follow-up sent automatically (10)
 *    - Follow-up not sent yet (0)
 *    - Replied after follow-up (20)
 * 
 * 4. Timeliness (0-10 points)
 *    - Replied within 24 hours (10)
 *    - 24-48 hours (5)
 *    - 3+ days (0)
 * 
 * @param data - The engagement and intent data for the roofing job
 * @returns Health score result with breakdown
 */
export function calculateRoofingJobHealthScore(data: RoofingJobHealthScoreData): HealthScoreResult {
  let engagement = 0;
  let intent = 0;
  let followUp = 0;
  let timeliness = 0;

  // Engagement Signals (0-40 points)
  // Highest engagement level wins (they're cumulative but we take the max)
  if (data.replied_with_intent) {
    engagement = 40;
  } else if (data.replied) {
    engagement = 30;
  } else if (data.clicked) {
    engagement = 20;
  } else if (data.opened) {
    engagement = 10;
  }

  // Roofing Intent Level (0-30 points)
  switch (data.intent) {
    case "need_estimate_this_week":
      intent = 30;
      break;
    case "shopping_around":
      intent = 20;
      break;
    case "maybe_later":
      intent = 10;
      break;
    case "not_now":
    default:
      intent = 0;
      break;
  }

  // Follow-Up Status (0-20 points)
  if (data.replied_after_followup) {
    followUp = 20;
  } else if (data.followup_sent) {
    followUp = 10;
  } else {
    followUp = 0;
  }

  // Timeliness (0-10 points)
  if (data.reply_hours !== null && data.reply_hours !== undefined) {
    if (data.reply_hours <= 24) {
      timeliness = 10;
    } else if (data.reply_hours <= 48) {
      timeliness = 5;
    } else {
      timeliness = 0;
    }
  }

  const healthScore = engagement + intent + followUp + timeliness;
  
  // Ensure score is between 0-100
  const finalScore = Math.max(0, Math.min(100, healthScore));
  
  return {
    health_score: finalScore,
    breakdown: {
      engagement,
      intent,
      follow_up: followUp,
      timeliness,
    },
  };
}

/**
 * Determines the score bucket based on total score
 * @param score - Total health score (0-100)
 * @returns Score bucket: 'cold' | 'warm' | 'hot'
 */
export function bucketFromScore(score: number): "cold" | "warm" | "hot" {
  if (score >= 75) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

/**
 * Type alias for score components (matches the interface from Block 21381)
 */
export type ScoreComponents = RoofingJobHealthScoreData;

/**
 * Source event types that trigger health score updates
 */
export type SourceEventType =
  | "email_sent"
  | "email_open"
  | "email_click"
  | "email_reply"
  | "followup_sent"
  | "system_recalc";

/**
 * Generates a human-readable title for a timeline event
 */
export function titleForEvent(sourceEventType: SourceEventType, data: ScoreComponents): string {
  switch (sourceEventType) {
    case "email_sent":
      return "Estimate outreach sent";
    case "email_open":
      return "Homeowner opened your email";
    case "email_click":
      return "Homeowner clicked your estimate link";
    case "email_reply":
      return "Homeowner replied";
    case "followup_sent":
      return "Follow-up email sent";
    case "system_recalc":
    default:
      return "Job health updated";
  }
}

/**
 * Generates a detailed description for a timeline event
 */
export function descriptionForEvent(sourceEventType: SourceEventType, data: ScoreComponents): string {
  if (sourceEventType === "email_reply") {
    if (data.intent === "need_estimate_this_week") {
      return "They replied asking for an estimate this week.";
    }
    if (data.intent === "shopping_around") {
      return "They replied and are comparing roofing quotes.";
    }
    if (data.intent === "maybe_later") {
      return "They replied but want to wait before doing roof work.";
    }
    return "They replied to your message.";
  }

  if (sourceEventType === "email_click") {
    return "They clicked a link in your roofing email (likely checking your estimate or website).";
  }

  if (sourceEventType === "email_open") {
    return "They opened your roofing outreach email.";
  }

  if (sourceEventType === "followup_sent") {
    return "SmartSend sent a follow-up to keep this job warm.";
  }

  return "";
}

/**
 * Gets the previous score bucket for a roofing job
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param jobId - Roofing job ID
 * @returns Previous bucket or null if no previous score exists
 */
async function getPreviousBucket(
  supabase: any,
  orgId: string,
  jobId: string
): Promise<"hot" | "warm" | "cold" | null> {
  const { data, error } = await supabase
    .from("roofing_job_health_scores")
    .select("score_bucket")
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (error || !data) return null;
  return data.score_bucket as "hot" | "warm" | "cold";
}

/**
 * Sends push notification to all registered devices for an organization
 * when a job transitions to HOT status
 * @param supabase - Supabase client
 * @param orgId - Organization ID
 * @param payload - Push notification payload with homeowner name, score, and job ID
 */
async function sendHotLeadPushToOrg(
  supabase: any,
  orgId: string,
  payload: { homeownerName: string | null; score: number; jobId: string }
): Promise<void> {
  // Fetch push targets for this org
  const { data: targets, error } = await supabase
    .from("user_push_targets")
    .select("provider, target_id")
    .eq("org_id", orgId);

  if (error || !targets || !targets.length) {
    console.log("No push targets found for org", orgId);
    return;
  }

  // Filter OneSignal targets
  const playerIds = targets
    .filter((t) => t.provider === "onesignal")
    .map((t) => t.target_id);

  if (!playerIds.length) {
    console.log("No OneSignal push targets found for org", orgId);
    return;
  }

  // Get OneSignal credentials from environment
  const onesignalApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID") || Deno.env.get("NEXT_PUBLIC_ONESIGNAL_APP_ID");

  if (!onesignalApiKey || !onesignalAppId) {
    console.error("OneSignal credentials not configured. Set ONESIGNAL_REST_API_KEY and ONESIGNAL_APP_ID environment variables.");
    return;
  }

  const title = "🔥 New HOT roofing lead";
  const name = payload.homeownerName || "New homeowner";
  const body = `${name} just turned HOT (Health Score ${payload.score}). Call them now to book the job.`;

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Basic ${onesignalApiKey}`,
      },
      body: JSON.stringify({
        app_id: onesignalAppId,
        include_player_ids: playerIds,
        headings: { en: title },
        contents: { en: body },
        data: {
          job_id: payload.jobId,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to send OneSignal push notification", response.status, errorText);
    } else {
      console.log(`Sent HOT lead push notification to ${playerIds.length} device(s) for org ${orgId}`);
    }
  } catch (error) {
    console.error("Error sending push notification", error);
  }
}

/**
 * Updates the roofing job health score in the database via RPC
 * 
 * This function calculates the score, determines the bucket, and saves it to the database.
 * It also logs a timeline entry for the health score change (Block 21386).
 * If the job transitions to HOT status, it sends push notifications (Block 21392).
 * It should be called from Edge Functions after calculating the score from engagement data.
 * 
 * @param orgId - Organization ID
 * @param jobId - Roofing job ID
 * @param data - Score components (engagement signals, intent, etc.)
 * @param sourceEventType - What triggered this score update (default: "system_recalc")
 * @param homeownerName - Optional homeowner name for push notifications (if not provided, will be fetched from DB)
 * @returns The saved health score record
 */
export async function updateRoofingJobHealthScore(
  orgId: string,
  jobId: string,
  data: ScoreComponents,
  sourceEventType: SourceEventType = "system_recalc",
  homeownerName: string | null = null
): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  // Get previous bucket before updating (Block 21392)
  const previousBucket = await getPreviousBucket(supabase, orgId, jobId);

  // Calculate the total score and breakdown
  const result = calculateRoofingJobHealthScore(data);
  const total = result.health_score;
  
  // Extract component scores from breakdown
  // Note: The breakdown scores are 0-40 for engagement, 0-30 for intent, etc.
  // But we're storing them as 0-100 in the DB, so we'll normalize them
  // For now, we'll store the raw component scores (they sum to total)
  const engagement = result.breakdown.engagement;
  const intent = result.breakdown.intent;
  const followUp = result.breakdown.follow_up;
  const timeliness = result.breakdown.timeliness;

  const scoreBucket = bucketFromScore(total);

  // 1) Save current snapshot in main table
  const { data: row, error: scoreError } = await supabase.rpc(
    "save_roofing_job_health_score",
    {
      _org_id: orgId,
      _job_id: jobId,
      _latest_score: total,
      _engagement_score: engagement,
      _intent_score: intent,
      _follow_up_score: followUp,
      _timeliness_score: timeliness,
      _score_bucket: scoreBucket,
    }
  );

  if (scoreError) {
    console.error("Failed to save roofing job health score", scoreError);
    throw scoreError;
  }

  // 2) Log storyline entry (Block 21386)
  const title = titleForEvent(sourceEventType, data);
  const description = descriptionForEvent(sourceEventType, data);

  const { error: timelineError } = await supabase
    .from("roofing_job_health_timeline")
    .insert({
      org_id: orgId,
      job_id: jobId,
      source_event_type: sourceEventType,
      title,
      description,
      latest_score: total,
      engagement_score: engagement,
      intent_score: intent,
      follow_up_score: followUp,
      timeliness_score: timeliness,
      score_bucket: scoreBucket,
    });

  if (timelineError) {
    console.error("Failed to log roofing job health timeline event", timelineError);
    // don't throw here; score is already saved, this is just narrative
  }

  // 3) If we just turned HOT, send push notifications (Block 21392)
  if (scoreBucket === "hot" && previousBucket !== "hot") {
    // Fetch homeowner name if not provided
    let finalHomeownerName = homeownerName;
    if (!finalHomeownerName) {
      const { data: jobData } = await supabase
        .from("roofing_jobs")
        .select("homeowner_name")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();
      
      if (jobData) {
        finalHomeownerName = jobData.homeowner_name;
      }
    }

    // Send push notification (non-blocking - don't throw on error)
    await sendHotLeadPushToOrg(supabase, orgId, {
      homeownerName: finalHomeownerName,
      score: total,
      jobId,
    }).catch((error) => {
      console.error("Failed to send HOT lead push notification", error);
      // Don't throw - push notification failure shouldn't break score update
    });
  }

  return row;
}

// Edge function handler (optional - can be called as HTTP endpoint)
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const data: RoofingJobHealthScoreData = body;

    const result = calculateRoofingJobHealthScore(data);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error calculating health score:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

