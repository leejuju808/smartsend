// Block 8850 — Lead Score Engine v1
// Scoring engine module for SmartSend

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const SCORE_RULES: Record<string, number> = {
  // Positive events
  "open": 5,
  "click": 10,
  "reply": 20,
  "reply_job_keywords": 30,
  "reply_booking_intent": 40,
  "reply_phone": 50,
  "appointment_booked": 100,

  // Warranty-related events (Block 32277)
  "warranty_contact_first": 20, // Homeowner contacts roofer first (loyalty signal)
  "warranty_active": 10, // Warranty still active
  "warranty_claim_urgent": 30, // Warranty claim mentions leak/active damage

  // Negative events
  "no_response_7": -10,
  "no_response_15": -20,
  "bounce": -100,
  "unsubscribe": -100,
};

/**
 * Apply a score event to a lead
 * Updates the lead's score and logs the event
 */
export async function applyScoreEvent(
  supabase: ReturnType<typeof createClient<Database>>,
  {
    lead_id,
    owner_id,
    event_type,
    metadata = {},
  }: {
    lead_id: string;
    owner_id: string;
    event_type: string;
    metadata?: any;
  }
): Promise<void> {
  try {
    const delta = SCORE_RULES[event_type] ?? 0;

    if (delta === 0) {
      // No scoring rule for this event type, skip
      return;
    }

    // Get current score
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("score, workspace_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      console.error("Lead not found for scoring:", leadError);
      return;
    }

    const currentScore = lead.score ?? 0;
    const newScore = Math.max(0, Math.min(100, currentScore + delta));

    // Update lead score
    const { error: updateError } = await supabase
      .from("leads")
      .update({ score: newScore })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead score:", updateError);
      return;
    }

    // Log event
    await supabase.from("lead_score_events").insert({
      lead_id,
      owner_id,
      event_type,
      delta,
      new_score: newScore,
      metadata,
    });

    // Auto-convert score to hot if >= 80
    if (newScore >= 80) {
      await supabase
        .from("leads")
        .update({ classification: "hot" })
        .eq("id", lead_id);
    }
  } catch (error) {
    console.error("Error in applyScoreEvent:", error);
  }
}

/**
 * Helper function to detect roofing keywords in text
 */
export function containsRoofingKeywords(text: string): boolean {
  const keywords = [
    "roof",
    "roofing",
    "leak",
    "leaking",
    "shingle",
    "shingles",
    "gutter",
    "gutters",
    "damage",
    "storm",
    "hail",
    "insurance",
    "quote",
    "estimate",
    "repair",
    "replace",
  ];
  
  const lowerText = text.toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword));
}

/**
 * Helper function to detect booking intent in text
 */
export function containsBookingIntent(text: string): boolean {
  const phrases = [
    "schedule",
    "appointment",
    "meeting",
    "available",
    "when can",
    "what time",
    "call me",
    "call you",
    "free consultation",
    "inspection",
    "estimate",
    "quote",
  ];
  
  const lowerText = text.toLowerCase();
  return phrases.some((phrase) => lowerText.includes(phrase));
}

/**
 * Helper function to detect phone number in text
 */
export function containsPhoneNumber(text: string): boolean {
  // Simple regex for phone numbers
  const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
  return phoneRegex.test(text);
}

/**
 * Block 17900: Apply phone quality score to lead score
 * Phone quality impacts lead scoring:
 * - High quality phone (90+): +10 points
 * - Normal phone (70-89): +5 points
 * - Low quality phone (50-69): -5 points
 * - Suspect phone (<50): -15 points
 */
export async function applyPhoneQualityScore(
  supabase: ReturnType<typeof createClient<Database>>,
  leadId: string,
  contactId?: string
): Promise<void> {
  try {
    // Get contact's phone intelligence
    if (!contactId) {
      // Try to get contact_id from lead
      const { data: lead } = await supabase
        .from("leads")
        .select("contact_id")
        .eq("id", leadId)
        .maybeSingle();
      
      contactId = lead?.contact_id;
    }

    if (!contactId) {
      return; // No contact to check
    }

    // Get contact's phone quality score
    const { data: contact } = await supabase
      .from("contacts")
      .select("phone_quality_score, phone")
      .eq("id", contactId)
      .maybeSingle();

    if (!contact?.phone_quality_score) {
      return; // No phone quality score available
    }

    const phoneQualityScore = contact.phone_quality_score;
    let phoneScoreDelta = 0;

    // Map phone quality to lead score delta
    if (phoneQualityScore >= 90) {
      phoneScoreDelta = 10; // High quality phone
    } else if (phoneQualityScore >= 70) {
      phoneScoreDelta = 5; // Normal phone
    } else if (phoneQualityScore >= 50) {
      phoneScoreDelta = -5; // Low quality phone
    } else {
      phoneScoreDelta = -15; // Suspect phone
    }

    if (phoneScoreDelta === 0) {
      return; // No change
    }

    // Get current lead score
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("score, owner_id")
      .eq("id", leadId)
      .maybeSingle();

    if (leadError || !lead) {
      console.error("Lead not found for phone quality scoring:", leadError);
      return;
    }

    const currentScore = lead.score ?? 0;
    const newScore = Math.max(0, Math.min(100, currentScore + phoneScoreDelta));

    // Update lead score
    const { error: updateError } = await supabase
      .from("leads")
      .update({ score: newScore })
      .eq("id", leadId);

    if (updateError) {
      console.error("Error updating lead score with phone quality:", updateError);
      return;
    }

    // Log event
    await supabase.from("lead_score_events").insert({
      lead_id: leadId,
      owner_id: lead.owner_id,
      event_type: "phone_quality_score",
      delta: phoneScoreDelta,
      new_score: newScore,
      metadata: {
        phone_quality_score: phoneQualityScore,
        phone: contact.phone,
      },
    });

    // Auto-convert score to hot if >= 80
    if (newScore >= 80) {
      await supabase
        .from("leads")
        .update({ classification: "hot" })
        .eq("id", leadId);
    }
  } catch (error) {
    console.error("Error in applyPhoneQualityScore:", error);
  }
}

/**
 * Block 32277: Apply warranty score boost
 * Warranty-connected homeowners get score boosts:
 * - +20 for contacting roofer first (loyalty signal)
 * - +10 if warranty still active
 * - +30 if claim mentions leak/active damage
 */
export async function applyWarrantyScoreBoost(
  supabase: ReturnType<typeof createClient<Database>>,
  {
    lead_id,
    owner_id,
    boost_type,
    has_active_warranty = false,
    claim_message = "",
  }: {
    lead_id: string;
    owner_id: string;
    boost_type: "warranty_contact_first" | "warranty_active" | "warranty_claim_urgent";
    has_active_warranty?: boolean;
    claim_message?: string;
  }
): Promise<void> {
  try {
    let delta = SCORE_RULES[boost_type] ?? 0;

    // Additional logic for warranty_claim_urgent
    if (boost_type === "warranty_claim_urgent" && claim_message) {
      const messageLower = claim_message.toLowerCase();
      const hasUrgentKeywords = /\b(leak|leaking|water|damage|emergency|urgent)\b/i.test(messageLower);
      if (!hasUrgentKeywords) {
        // If no urgent keywords, use lower boost
        delta = 20;
      }
    }

    // Add active warranty boost if applicable
    if (has_active_warranty && boost_type !== "warranty_active") {
      delta += SCORE_RULES["warranty_active"] || 0;
    }

    if (delta === 0) {
      return;
    }

    // Get current score
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("score, workspace_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError || !lead) {
      console.error("Lead not found for warranty scoring:", leadError);
      return;
    }

    const currentScore = lead.score ?? 0;
    const newScore = Math.max(0, Math.min(100, currentScore + delta));

    // Update lead score
    const { error: updateError } = await supabase
      .from("leads")
      .update({ score: newScore })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead score with warranty boost:", updateError);
      return;
    }

    // Log event
    await supabase.from("lead_score_events").insert({
      lead_id,
      owner_id,
      event_type: boost_type,
      delta,
      new_score: newScore,
      metadata: {
        has_active_warranty,
        claim_message: claim_message ? claim_message.substring(0, 200) : undefined,
      },
    });

    // Auto-convert score to hot if >= 80
    if (newScore >= 80) {
      await supabase
        .from("leads")
        .update({ classification: "hot" })
        .eq("id", lead_id);
    }
  } catch (error) {
    console.error("Error in applyWarrantyScoreBoost:", error);
  }
}





