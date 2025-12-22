/**
 * Block 15600 — SmartSend List Intelligence v1
 * Service functions for list classification and intelligence
 */

import { createClient } from "@/lib/supabase/server";

export interface ListIntelligenceResult {
  list_type: string;
  priority_score: number;
  storm_count: number;
  insurance_count: number;
  old_quote_count: number;
  total_contacts: number;
  valid_emails: number;
  invalid_emails: number;
  low_quality_flag: boolean;
  commercial_flag: boolean;
  estimated_revenue: number | null;
  recommended_campaign_type: string | null;
}

/**
 * Analyze a list and classify it using the database function
 */
export async function analyzeListIntelligence(
  listId: string
): Promise<ListIntelligenceResult | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.rpc(
      "classify_list_intelligence",
      {
        p_list_id: listId,
      }
    );

    if (error) {
      console.error("Error analyzing list intelligence:", error);
      return null;
    }

    return data as ListIntelligenceResult;
  } catch (err) {
    console.error("Exception analyzing list intelligence:", err);
    return null;
  }
}

/**
 * Get list insights including intelligence data
 */
export async function getListInsights(listId: string) {
  const supabase = createClient();

  const { data: list, error } = await supabase
    .from("contact_lists")
    .select(
      `
      id,
      name,
      description,
      list_type,
      priority_score,
      storm_count,
      insurance_count,
      old_quote_count,
      estimated_revenue,
      low_quality_flag,
      commercial_flag,
      total_contacts,
      valid_emails,
      invalid_emails,
      recommended_campaign_type,
      intelligence_analyzed_at,
      intelligence_version
    `
    )
    .eq("id", listId)
    .single();

  if (error || !list) {
    return null;
  }

  return list;
}

/**
 * Get list intelligence timeline events
 */
export async function getListIntelligenceTimeline(listId: string) {
  const supabase = createClient();

  const { data: timeline, error } = await supabase
    .from("list_intelligence_timeline")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error fetching timeline:", error);
    return [];
  }

  return timeline || [];
}

/**
 * Get priority badge label from score
 */
export function getPriorityBadge(score: number | null): "HIGH" | "MEDIUM" | "LOW" {
  if (score === null) return "LOW";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * Get list type display name
 */
export function getListTypeDisplayName(listType: string | null): string {
  const typeMap: Record<string, string> = {
    storm_leads: "Storm List",
    old_quotes: "Old Quotes",
    insurance_interest: "Insurance Leads",
    neighborhood_list: "Neighborhood List",
    low_quality_leads: "Low Quality",
    commercial_leads: "Commercial List",
    website_leads: "Website Leads",
    unknown: "Unknown",
  };

  return typeMap[listType || "unknown"] || "Unknown";
}





















































