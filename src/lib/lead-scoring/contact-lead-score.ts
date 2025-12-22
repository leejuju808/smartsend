/**
 * Block 13800 — SmartSend Lead Score Engine v1
 * TypeScript helper functions for contact lead scoring
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type LeadScoreCategory = "COLD" | "WARM" | "HOT";

export interface LeadScoreResult {
  score: number;
  category: LeadScoreCategory;
  previousScore?: number;
  delta?: number;
}

export interface LeadScoreBreakdown {
  replySignals: number;
  intentScore: number;
  stormRisk: number;
  insuranceIndicators: number;
  repairSignals: number;
  replacementSignals: number;
  pastQuoteHistory: number;
  engagementBehavior: number;
  highValueIndicators: number;
  lowQualityPenalties: number;
  total: number;
}

/**
 * Get lead score category from score value
 */
export function getLeadScoreCategory(score: number): LeadScoreCategory {
  if (score >= 61) return "HOT";
  if (score >= 21) return "WARM";
  return "COLD";
}

/**
 * Get badge color for lead score
 */
export function getLeadScoreBadgeColor(score: number): string {
  const category = getLeadScoreCategory(score);
  switch (category) {
    case "HOT":
      return "bg-red-500 text-white"; // Red/orange high-value badge
    case "WARM":
      return "bg-yellow-500 text-white"; // Yellow moderate badge
    case "COLD":
      return "bg-blue-500 text-white"; // Blue low badge
  }
}

/**
 * Get emoji for lead score category
 */
export function getLeadScoreEmoji(score: number): string {
  const category = getLeadScoreCategory(score);
  switch (category) {
    case "HOT":
      return "🔥";
    case "WARM":
      return "🟡";
    case "COLD":
      return "🔵";
  }
}

/**
 * Format lead score for display
 */
export function formatLeadScore(score: number): string {
  const category = getLeadScoreCategory(score);
  const emoji = getLeadScoreEmoji(score);
  return `${emoji} ${score} ${category}`;
}

/**
 * Update contact lead score
 * Calls the database function to recalculate and update score
 */
export async function updateContactLeadScore(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  reason: string,
  eventId?: string,
  metadata?: Record<string, any>
): Promise<LeadScoreResult> {
  const { data, error } = await supabase.rpc("update_contact_lead_score", {
    p_contact_id: contactId,
    p_reason: reason,
    p_event_id: eventId || null,
    p_metadata: metadata || {},
  });

  if (error) {
    throw new Error(`Failed to update lead score: ${error.message}`);
  }

  const score = data as number;
  return {
    score,
    category: getLeadScoreCategory(score),
  };
}

/**
 * Recalculate lead score for a contact
 * This is a more comprehensive recalculation that gathers all data
 */
export async function recalculateContactLeadScore(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  reason: string = "manual_recalculation"
): Promise<LeadScoreResult> {
  return updateContactLeadScore(supabase, contactId, reason);
}

/**
 * Get lead score events for a contact
 */
export async function getLeadScoreEvents(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  limit: number = 50
) {
  const { data, error } = await supabase
    .from("lead_score_events")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get lead score events: ${error.message}`);
  }

  return data;
}

/**
 * Get contacts sorted by lead score
 */
export async function getContactsByScore(
  supabase: ReturnType<typeof createClient<Database>>,
  workspaceId: string,
  options: {
    minScore?: number;
    maxScore?: number;
    category?: LeadScoreCategory;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (options.category) {
    switch (options.category) {
      case "HOT":
        query = query.gte("lead_score", 61);
        break;
      case "WARM":
        query = query.gte("lead_score", 21).lt("lead_score", 61);
        break;
      case "COLD":
        query = query.lt("lead_score", 21);
        break;
    }
  }

  if (options.minScore !== undefined) {
    query = query.gte("lead_score", options.minScore);
  }

  if (options.maxScore !== undefined) {
    query = query.lte("lead_score", options.maxScore);
  }

  query = query.order("lead_score", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get contacts by score: ${error.message}`);
  }

  return data;
}

/**
 * Get lead score statistics for a workspace
 */
export async function getLeadScoreStats(
  supabase: ReturnType<typeof createClient<Database>>,
  workspaceId: string
) {
  const { data, error } = await supabase
    .from("contacts")
    .select("lead_score")
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`Failed to get lead score stats: ${error.message}`);
  }

  const scores = data.map((c) => c.lead_score || 0);
  const hotCount = scores.filter((s) => s >= 61).length;
  const warmCount = scores.filter((s) => s >= 21 && s < 61).length;
  const coldCount = scores.filter((s) => s < 21).length;
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    total: scores.length,
    hot: hotCount,
    warm: warmCount,
    cold: coldCount,
    average: Math.round(avgScore * 10) / 10,
  };
}





















































