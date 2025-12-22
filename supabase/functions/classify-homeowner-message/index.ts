// Block 21823 — SmartSend Roofing Homeowner Tone Intent Engine v1
// AI-Powered Emotion + Intent Detection for Every Incoming Message
//
// This edge function classifies homeowner messages with tone and intent
// Called automatically when a message_in activity is created

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Valid tone values
const VALID_TONES = [
  "positive",
  "neutral",
  "confused",
  "impatient",
  "angry",
  "price-shopping",
  "scheduling-focused",
  "appreciation"
] as const;

// Valid intent values
const VALID_INTENTS = [
  "high intent",
  "medium intent",
  "low intent",
  "not interested",
  "needs clarification",
  "ready to book",
  "wants price",
  "stalling"
] as const;

Deno.serve(async (req) => {
  try {
    const { activity_id, message_body } = await req.json();

    if (!activity_id || !message_body) {
      return new Response(
        JSON.stringify({ error: "activity_id and message_body are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify activity exists and is a message_in type
    const { data: activity, error: activityError } = await supabase
      .from("lead_activities")
      .select("id, kind, body")
      .eq("id", activity_id)
      .single();

    if (activityError || !activity) {
      return new Response(
        JSON.stringify({ error: "Activity not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (activity.kind !== "message_in") {
      return new Response(
        JSON.stringify({ error: "Activity is not a message_in type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // AI classification prompt
    const prompt = `You are an AI assistant specialized in analyzing homeowner messages for roofing contractors.

Classify the following homeowner message for TONE and INTENT.

TONE options (choose ONE):
- positive: Expresses gratitude, satisfaction, or enthusiasm
- neutral: Standard business communication, no strong emotion
- confused: Asks for clarification, seems uncertain or doesn't understand
- impatient: Expresses urgency, frustration with delays, wants faster response
- angry: Shows anger, dissatisfaction, or strong negative emotion
- price-shopping: Focuses primarily on cost, comparing prices, asking for quotes only
- scheduling-focused: Wants to schedule, asks about availability, ready to meet
- appreciation: Expresses thanks or appreciation

INTENT options (choose ONE):
- high intent: Strong interest, ready to move forward, asking next steps
- medium intent: Moderate interest, engaged but not urgent
- low intent: Minimal interest, casual inquiry
- not interested: Explicitly declining, asking to stop, unsubscribe
- needs clarification: Asking questions, needs more information
- ready to book: Wants to schedule, ready to commit, asking for appointment
- wants price: Asking for quote, pricing information, cost details
- stalling: Delaying decision, "I'll think about it", not ready yet

Message to classify:
"""
${message_body}
"""

Return ONLY valid JSON with this exact structure:
{
  "tone": "one of the tone options above",
  "intent": "one of the intent options above"
}

Do not include any other text or explanation.`;

    // Call OpenAI for classification
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a classification assistant. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let parsed: { tone?: string; intent?: string };

    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      return new Response(
        JSON.stringify({ error: "Failed to parse classification response" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate and normalize tone
    let tone = parsed.tone?.toLowerCase().trim();
    if (!tone || !VALID_TONES.includes(tone as any)) {
      // Fallback: try to match partial strings
      const matchedTone = VALID_TONES.find((t) => tone?.includes(t) || t.includes(tone || ""));
      tone = matchedTone || "neutral";
    }

    // Validate and normalize intent
    let intent = parsed.intent?.toLowerCase().trim();
    if (!intent || !VALID_INTENTS.includes(intent as any)) {
      // Fallback: try to match partial strings
      const matchedIntent = VALID_INTENTS.find((i) => intent?.includes(i) || i.includes(intent || ""));
      intent = matchedIntent || "medium intent";
    }

    // Write results to database
    const { error: updateError } = await supabase
      .from("lead_activities")
      .update({
        homeowner_tone: tone,
        homeowner_intent: intent,
      })
      .eq("id", activity_id);

    if (updateError) {
      console.error("Error updating lead_activities:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update activity classification" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        tone,
        intent,
        activity_id,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in classify-homeowner-message:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









































