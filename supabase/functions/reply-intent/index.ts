// Block 438 — Reply Intent AI Classifier v1
// Classifies replies into: Interested • Not Interested • Maybe • Not Now • Unsubscribe • Wrong Person • Other
// Triggered each time a reply email is ingested

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://deno.land/x/openai@v4.20.1/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

type ReplyIntent =
  | "interested"
  | "not_interested"
  | "maybe"
  | "not_now"
  | "unsubscribe"
  | "wrong_person"
  | "other";

interface ClassificationResult {
  intent: ReplyIntent;
  confidence: number;
}

Deno.serve(async (req) => {
  try {
    const { text, event_id, lead_id } = await req.json();

    if (!text || !event_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text, event_id, lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Classify the reply using OpenAI
    const prompt = `Classify this email reply:

"${text}"

Respond ONLY in JSON:

{
  "intent": "interested" | "not_interested" | "maybe" | "not_now" | "unsubscribe" | "wrong_person" | "other",
  "confidence": 0-1
}

Guidelines:
- "interested": Wants a call, wants info, positive signal
- "not_interested": Hard no, clear rejection
- "maybe": Soft yes, asks for more info, tentative interest
- "not_now": Delayed, ask to follow up later, busy now
- "unsubscribe": "remove me", "stop emailing me", opt-out requests
- "wrong_person": "not the right contact", "forwarding you to XYZ", wrong recipient
- "other": Uncategorized, unclear intent

Return confidence as a float between 0 and 1.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result: ClassificationResult = JSON.parse(content);
    const { intent, confidence } = result;

    // Validate intent
    const validIntents: ReplyIntent[] = [
      "interested",
      "not_interested",
      "maybe",
      "not_now",
      "unsubscribe",
      "wrong_person",
      "other",
    ];

    if (!validIntents.includes(intent)) {
      throw new Error(`Invalid intent: ${intent}`);
    }

    // Validate confidence
    const validConfidence = Math.max(0, Math.min(1, confidence || 0));

    // Get campaign_id from event
    const { data: event } = await supabase
      .from("email_events")
      .select("campaign_id")
      .eq("id", event_id)
      .single();

    const campaignId = event?.campaign_id;

    // Update email_events
    const { error: updateEventError } = await supabase
      .from("email_events")
      .update({
        reply_intent: intent,
        reply_confidence: validConfidence,
      })
      .eq("id", event_id);

    if (updateEventError) {
      console.error("Failed to update email_events:", updateEventError);
      throw updateEventError;
    }

    // Update lead_engagement
    if (campaignId) {
      // Use the helper function to update lead_engagement
      const { error: engagementError } = await supabase.rpc(
        "update_lead_engagement_from_reply",
        {
          p_lead_id: lead_id,
          p_campaign_id: campaignId,
          p_reply_intent: intent,
          p_reply_confidence: validConfidence,
          p_replied_at: new Date().toISOString(),
        }
      );

      if (engagementError) {
        console.error("Failed to update lead_engagement:", engagementError);
        // Don't throw - this is not critical
      }

      // Apply intent-based automation
      const { error: automationError } = await supabase.rpc(
        "apply_reply_intent_automation",
        {
          p_lead_id: lead_id,
          p_campaign_id: campaignId,
          p_reply_intent: intent,
          p_event_id: event_id,
        }
      );

      if (automationError) {
        console.error("Failed to apply automation:", automationError);
        // Don't throw - automation failures shouldn't break classification
      }
    }

    return new Response(
      JSON.stringify({
        intent,
        confidence: validConfidence,
        event_id,
        lead_id,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("reply-intent error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
