// Block 21380 — SmartSend Roofing Job Health Score v1
// Simple, opinionated scoring for roofing job leads

export type LeadIntentLabel =
  | "hot"
  | "warm"
  | "cold"
  | "not_interested"
  | "unknown";

export interface LeadScoringInput {
  lastMessageBody: string;          // most recent inbound message from homeowner
  lastMessageAt: string | Date;     // timestamp of that message
  intentLabel: LeadIntentLabel;     // from your reply classifier
  serviceAreas?: string[];          // e.g. ["Boise", "Meridian", "Nampa"]
}

export interface LeadScoreBreakdown {
  score_total: number;
  score_intent: number;
  score_recency: number;
  score_keyword_match: number;
  score_locality_match: number;
  score_email_quality: number;
  score_last_updated: string;       // ISO timestamp for DB
}

// Roofing-specific keywords we care about
const ROOFING_KEYWORDS = [
  "roof",
  "roofing",
  "shingle",
  "shingles",
  "leak",
  "leaking",
  "water spot",
  "water damage",
  "hail",
  "hail damage",
  "storm damage",
  "wind damage",
  "missing shingle",
  "replacement",
  "replacing roof",
  "new roof",
  "re-roof",
  "reroof",
  "gutter",
  "gutters",
  "soffit",
  "fascia",
  "insurance",
  "insurance claim",
];

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function calculateIntentScore(intent: LeadIntentLabel): number {
  switch (intent) {
    case "hot":
      return 40; // asked for quote, ready to talk
    case "warm":
      return 25; // interested but needs more info
    case "cold":
      return 10; // vague or low urgency
    case "not_interested":
      return 0;
    case "unknown":
    default:
      return 5; // we know nothing yet
  }
}

function calculateRecencyScore(lastMessageAt: string | Date): number {
  const now = new Date();
  const date = typeof lastMessageAt === "string" ? new Date(lastMessageAt) : lastMessageAt;
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return 25;       // today / yesterday
  if (diffDays <= 3) return 20;
  if (diffDays <= 7) return 15;
  if (diffDays <= 14) return 10;
  if (diffDays <= 30) return 5;
  return 0;                           // old / stale
}

function calculateKeywordScore(body: string): number {
  const text = normalizeText(body);
  let matches = 0;

  for (const keyword of ROOFING_KEYWORDS) {
    if (text.includes(keyword)) {
      matches += 1;
    }
  }

  // Each unique roofing keyword = 5 points, capped at 20
  return Math.min(matches * 5, 20);
}

function calculateLocalityScore(body: string, serviceAreas?: string[]): number {
  if (!serviceAreas || serviceAreas.length === 0) return 0;

  const text = normalizeText(body);

  const hasLocalMatch = serviceAreas.some((area) =>
    text.includes(area.toLowerCase())
  );

  // Yes/No for now. v2 can do distance-based scoring.
  return hasLocalMatch ? 10 : 0;
}

function calculateEmailQualityScore(body: string): number {
  const text = body.trim();

  if (!text) return 0;

  const length = text.length;
  const hasPunctuation =
    text.includes(".") || text.includes("?") || text.includes("!");

  // rough heuristic: we reward messages that look like a real homeowner
  if (length > 300 && hasPunctuation) return 5;
  if (length > 150) return 4;
  if (length > 60) return 3;
  if (length > 20) return 2;
  return 1;
}

/**
 * Main scoring function — call this whenever:
 * - a new reply comes in
 * - intent label is updated
 * - you want to recompute a lead's health
 */
export function calculateLeadScore(
  input: LeadScoringInput
): LeadScoreBreakdown {
  const {
    lastMessageBody,
    lastMessageAt,
    intentLabel,
    serviceAreas,
  } = input;

  const score_intent = calculateIntentScore(intentLabel);
  const score_recency = calculateRecencyScore(lastMessageAt);
  const score_keyword_match = calculateKeywordScore(lastMessageBody || "");
  const score_locality_match = calculateLocalityScore(
    lastMessageBody || "",
    serviceAreas
  );
  const score_email_quality = calculateEmailQualityScore(lastMessageBody || "");

  const score_total =
    score_intent +
    score_recency +
    score_keyword_match +
    score_locality_match +
    score_email_quality;

  return {
    score_total,
    score_intent,
    score_recency,
    score_keyword_match,
    score_locality_match,
    score_email_quality,
    score_last_updated: new Date().toISOString(),
  };
}















































