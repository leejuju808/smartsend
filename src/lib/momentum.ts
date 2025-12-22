// Block 21998 — SmartSend Roofing Job Momentum Score v1
// Utility functions and signal definitions for momentum score updates

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface MomentumSignal {
  type: string;
  value: number;
  description?: string;
}

/**
 * Momentum signal values based on Block 21998 specification
 */
export const MomentumSignals = {
  // 🔥 Positive Momentum Signals
  NEW_MESSAGE_HOMEOWNER: { type: "new_message_homeowner", value: 5 },
  HOMEOWNER_REPLY_FAST: { type: "homeowner_reply_fast", value: 10 }, // < 1 hour
  ESTIMATOR_REPLY_FAST: { type: "estimator_reply_fast", value: 10 }, // < 10 minutes
  TONE_POSITIVE: { type: "tone_positive", value: 10 },
  HOMEOWNER_SENDS_PHOTOS: { type: "homeowner_sends_photos", value: 15 },
  PROPOSAL_REQUESTED: { type: "proposal_requested", value: 25 },
  PROPOSAL_SENT_FAST: { type: "proposal_sent_fast", value: 20 }, // < 6 hours
  SCHEDULING_QUESTIONS: { type: "scheduling_questions", value: 25 },
  HOMEOWNER_URGENCY: { type: "homeowner_urgency", value: 20 },
  EXPERIENCE_SCORE_RISING: { type: "experience_score_rising", value: 5 },

  // ❄️ Negative Momentum Signals
  NO_REPLY_24H: { type: "no_reply_24h", value: -10 },
  NO_CONTACT_48H: { type: "no_contact_48h", value: -20 },
  ESTIMATOR_SLOW_RESPONSE: { type: "estimator_slow_response", value: -10 }, // > 1 hour
  ESTIMATOR_SLOW_PROPOSAL: { type: "estimator_slow_proposal", value: -25 }, // > 24h
  TONE_NEGATIVE: { type: "tone_negative", value: -20 },
  INTENT_SHOPPING: { type: "intent_shopping", value: -15 },
  RISK_MEDIUM: { type: "risk_medium", value: -10 },
  RISK_HIGH: { type: "risk_high", value: -20 },
  RISK_CRITICAL: { type: "risk_critical", value: -40 },
  EXPERIENCE_SCORE_DECLINING: { type: "experience_score_declining", value: -20 }, // > 10 points
} as const;

/**
 * Calculate momentum signals based on message timing
 */
export function calculateResponseTimeSignals(
  homeownerMessageAt: Date | string | null,
  estimatorReplyAt: Date | string | null,
  now: Date = new Date()
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!homeownerMessageAt || !estimatorReplyAt) {
    return signals;
  }

  const homeownerTime = new Date(homeownerMessageAt).getTime();
  const estimatorTime = new Date(estimatorReplyAt).getTime();
  const responseTimeMs = estimatorTime - homeownerTime;
  const responseTimeHours = responseTimeMs / (1000 * 60 * 60);

  // Fast response (< 10 minutes = 0.167 hours)
  if (responseTimeHours < 0.167) {
    signals.push({
      ...MomentumSignals.ESTIMATOR_REPLY_FAST,
      description: `Responded in ${Math.round(responseTimeMs / 1000 / 60)} minutes`,
    });
  } else if (responseTimeHours > 1) {
    // Slow response (> 1 hour)
    signals.push({
      ...MomentumSignals.ESTIMATOR_SLOW_RESPONSE,
      description: `Responded after ${Math.round(responseTimeHours)} hours`,
    });
  }

  return signals;
}

/**
 * Calculate momentum signals based on homeowner reply timing
 */
export function calculateHomeownerReplySignals(
  lastEstimatorMessageAt: Date | string | null,
  homeownerReplyAt: Date | string | null,
  now: Date = new Date()
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!lastEstimatorMessageAt || !homeownerReplyAt) {
    return signals;
  }

  const estimatorTime = new Date(lastEstimatorMessageAt).getTime();
  const homeownerTime = new Date(homeownerReplyAt).getTime();
  const responseTimeMs = homeownerTime - estimatorTime;
  const responseTimeHours = responseTimeMs / (1000 * 60 * 60);

  // Fast reply (< 1 hour)
  if (responseTimeHours < 1) {
    signals.push({
      ...MomentumSignals.HOMEOWNER_REPLY_FAST,
      description: `Replied in ${Math.round(responseTimeMs / 1000 / 60)} minutes`,
    });
  }

  return signals;
}

/**
 * Calculate momentum signals based on time gaps (no contact)
 */
export function calculateTimeGapSignals(
  lastActivityAt: Date | string | null,
  now: Date = new Date()
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!lastActivityAt) {
    return signals;
  }

  const lastActivity = new Date(lastActivityAt).getTime();
  const nowTime = now.getTime();
  const gapHours = (nowTime - lastActivity) / (1000 * 60 * 60);

  if (gapHours >= 48) {
    signals.push({
      ...MomentumSignals.NO_CONTACT_48H,
      description: `No contact for ${Math.round(gapHours)} hours`,
    });
  } else if (gapHours >= 24) {
    signals.push({
      ...MomentumSignals.NO_REPLY_24H,
      description: `No reply for ${Math.round(gapHours)} hours`,
    });
  }

  return signals;
}

/**
 * Calculate momentum signals based on risk category
 */
export function calculateRiskSignals(riskCategory: string | null): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!riskCategory) {
    return signals;
  }

  switch (riskCategory.toLowerCase()) {
    case "critical":
      signals.push({ ...MomentumSignals.RISK_CRITICAL });
      break;
    case "high":
      signals.push({ ...MomentumSignals.RISK_HIGH });
      break;
    case "medium":
      signals.push({ ...MomentumSignals.RISK_MEDIUM });
      break;
  }

  return signals;
}

/**
 * Calculate momentum signals based on tone
 */
export function calculateToneSignals(tone: string | null): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!tone) {
    return signals;
  }

  const toneLower = tone.toLowerCase();
  if (toneLower === "positive" || toneLower === "appreciation") {
    signals.push({ ...MomentumSignals.TONE_POSITIVE });
  } else if (toneLower === "angry" || toneLower === "impatient" || toneLower === "negative") {
    signals.push({ ...MomentumSignals.TONE_NEGATIVE });
  }

  return signals;
}

/**
 * Calculate momentum signals based on intent
 */
export function calculateIntentSignals(intent: string | null): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (!intent) {
    return signals;
  }

  const intentLower = intent.toLowerCase();
  if (intentLower.includes("shopping") || intentLower === "price-shopping") {
    signals.push({ ...MomentumSignals.INTENT_SHOPPING });
  } else if (intentLower.includes("schedule") || intentLower.includes("ready")) {
    signals.push({ ...MomentumSignals.SCHEDULING_QUESTIONS });
  } else if (intentLower.includes("urgent") || intentLower.includes("asap")) {
    signals.push({ ...MomentumSignals.HOMEOWNER_URGENCY });
  }

  return signals;
}

/**
 * Calculate momentum signals based on experience score change
 */
export function calculateExperienceScoreSignals(
  oldScore: number | null,
  newScore: number | null
): MomentumSignal[] {
  const signals: MomentumSignal[] = [];

  if (oldScore === null || newScore === null) {
    return signals;
  }

  const delta = newScore - oldScore;
  if (delta > 10) {
    signals.push({
      ...MomentumSignals.EXPERIENCE_SCORE_RISING,
      description: `Experience score increased by ${delta} points`,
    });
  } else if (delta < -10) {
    signals.push({
      ...MomentumSignals.EXPERIENCE_SCORE_DECLINING,
      description: `Experience score decreased by ${Math.abs(delta)} points`,
    });
  }

  return signals;
}

/**
 * Call the edge function to update momentum score
 */
export async function updateJobMomentum(
  leadId: string,
  signals: MomentumSignal[]
): Promise<{ ok: boolean; new_score: number; trend: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase configuration");
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/update-job-momentum`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        lead_id: leadId,
        signals,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update momentum:", error);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating momentum:", error);
    return null;
  }
}









































