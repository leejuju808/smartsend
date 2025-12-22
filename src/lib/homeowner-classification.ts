// Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
// Helper functions to trigger homeowner message classification

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const edgeFunctionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
  ".supabase.co",
  ".functions.supabase.co"
);

/**
 * Classify a homeowner message by calling the edge function
 * This should be called after a message_in activity is created
 */
export async function classifyHomeownerMessage(
  activityId: string,
  messageBody: string
): Promise<{ tone: string; intent: string } | null> {
  if (!edgeFunctionUrl) {
    console.warn("Edge function URL not configured");
    return null;
  }

  try {
    const response = await fetch(
      `${edgeFunctionUrl}/classify-homeowner-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          activity_id: activityId,
          message_body: messageBody,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Failed to classify homeowner message:",
        response.status,
        errorText
      );
      return null;
    }

    const result = await response.json();
    return {
      tone: result.tone,
      intent: result.intent,
    };
  } catch (error) {
    console.error("Error calling classification edge function:", error);
    return null;
  }
}

/**
 * Classify homeowner message activity by ID
 * Fetches the activity from the database and classifies it
 */
export async function classifyHomeownerActivity(
  activityId: string
): Promise<{ tone: string; intent: string } | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch the activity
  const { data: activity, error } = await supabase
    .from("lead_activities")
    .select("id, body, homeowner_tone, homeowner_intent")
    .eq("id", activityId)
    .single();

  if (error || !activity) {
    console.error("Activity not found:", error);
    return null;
  }

  // Skip if already classified
  if (activity.homeowner_tone && activity.homeowner_intent) {
    return {
      tone: activity.homeowner_tone,
      intent: activity.homeowner_intent,
    };
  }

  // Skip if no body text
  if (!activity.body || activity.body.trim() === "") {
    return null;
  }

  // Classify the message
  return classifyHomeownerMessage(activityId, activity.body);
}

/**
 * Batch classify multiple homeowner activities
 * Useful for backfilling existing messages
 */
export async function batchClassifyHomeownerActivities(
  activityIds: string[]
): Promise<{ [activityId: string]: { tone: string; intent: string } | null }> {
  const results: { [activityId: string]: { tone: string; intent: string } | null } = {};

  // Process in parallel with rate limiting (max 10 concurrent)
  const batchSize = 10;
  for (let i = 0; i < activityIds.length; i += batchSize) {
    const batch = activityIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (id) => {
        const result = await classifyHomeownerActivity(id);
        return { id, result };
      })
    );

    batchResults.forEach(({ id, result }) => {
      results[id] = result;
    });

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < activityIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Classify roofing-specific intent for a homeowner message
 * Block 21925 — SmartSend Roofing Lead Intent Classifier v1
 * This uses the new roofing-specific intent classifier with 12 intents
 */
export async function classifyRoofingIntent(
  activityId: string,
  messageBody: string,
  leadId?: string
): Promise<{ intent: string } | null> {
  if (!edgeFunctionUrl) {
    console.warn("Edge function URL not configured");
    return null;
  }

  try {
    const response = await fetch(
      `${edgeFunctionUrl}/classify-intent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          activity_id: activityId,
          message_body: messageBody,
          lead_id: leadId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Failed to classify roofing intent:",
        response.status,
        errorText
      );
      return null;
    }

    const result = await response.json();
    return {
      intent: result.intent,
    };
  } catch (error) {
    console.error("Error calling roofing intent classification edge function:", error);
    return null;
  }
}

/**
 * Classify roofing intent for a homeowner activity by ID
 * Fetches the activity from the database and classifies it
 */
export async function classifyRoofingIntentActivity(
  activityId: string
): Promise<{ intent: string } | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch the activity
  const { data: activity, error } = await supabase
    .from("lead_activities")
    .select("id, body, homeowner_intent, lead_id")
    .eq("id", activityId)
    .single();

  if (error || !activity) {
    console.error("Activity not found:", error);
    return null;
  }

  // Skip if already classified with roofing intent
  if (activity.homeowner_intent && activity.homeowner_intent.startsWith("intent_")) {
    return {
      intent: activity.homeowner_intent,
    };
  }

  // Skip if no body text
  if (!activity.body || activity.body.trim() === "") {
    return null;
  }

  // Classify the message
  return classifyRoofingIntent(activityId, activity.body, activity.lead_id);
}

