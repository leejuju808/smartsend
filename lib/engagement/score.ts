// Block 20030 — Behavioral AI Notes & Engagement Scoring

export interface EngagementResult {
  score: number;
  level: "cold" | "warm" | "hot";
}

export interface BehaviorNotes {
  tone: string;
  intent: string;
  risk: string;
}

/**
 * Score engagement based on reply text content
 * Returns score (0-100+) and level (cold/warm/hot)
 */
export function scoreEngagement(replyText: string): EngagementResult {
  let score = 0;
  const text = replyText.toLowerCase();

  // Positive signals (increase score)
  if (/estimate|quote|inspection/i.test(text)) score += 50;
  if (/urgent|leak|storm|hail|damage/i.test(text)) score += 30;
  if (/price|cost|how much/i.test(text)) score += 10;
  if (/when|available|schedule|appointment/i.test(text)) score += 15;
  if (/yes|interested|sounds good|let's do/i.test(text)) score += 20;
  if (/insurance|claim|adjuster/i.test(text)) score += 25;

  // Negative signals (decrease score)
  if (/not now|maybe later|not interested/i.test(text)) score -= 10;
  if (/stop|remove|unsubscribe|opt out/i.test(text)) score -= 999;
  if (/spam|junk|delete/i.test(text)) score -= 50;

  // Determine level
  let level: "cold" | "warm" | "hot" = "cold";
  if (score >= 40) {
    level = "hot";
  } else if (score >= 10) {
    level = "warm";
  }

  // Ensure score doesn't go negative (except for unsubscribe)
  if (score < 0 && score > -999) {
    score = 0;
  }

  return { score, level };
}

/**
 * Generate behavioral notes from reply text
 */
export function generateBehaviorNotes(replyText: string): string {
  const text = replyText.toLowerCase();
  
  const tone = /urgent|asap|leak|emergency/i.test(text) 
    ? "Urgent" 
    : /thank|appreciate|great/i.test(text)
    ? "Positive"
    : "Normal";

  let intent = "Unclear, follow-up needed.";
  if (/estimate|quote/i.test(text)) {
    intent = "Wants pricing.";
  } else if (/info|details|tell me more/i.test(text)) {
    intent = "Seeking info.";
  } else if (/schedule|appointment|when/i.test(text)) {
    intent = "Wants to schedule.";
  } else if (/insurance|claim/i.test(text)) {
    intent = "Insurance-related inquiry.";
  }

  const risk = /storm|hail|leak|damage|urgent/i.test(text) 
    ? "Potential claim job." 
    : "Low";

  return `• Tone: ${tone}
• Intent: ${intent}
• Risk: ${risk}`;
}

















































