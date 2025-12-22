// Block 21925 — SmartSend Roofing Lead Intent Classifier v1
// AI-Powered Intent Detection for Every Incoming Homeowner Message
//
// This edge function classifies homeowner messages into one of 12 roofing-specific intents
// Called automatically when a homeowner replies

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Valid roofing-specific intent values
const VALID_INTENTS = [
  "intent_book_estimate",
  "intent_schedule_inspection",
  "intent_needs_asap_service",
  "intent_request_price",
  "intent_price_shopping",
  "intent_provide_insurance_info",
  "intent_ask_insurance_process",
  "intent_ready_for_proposal",
  "intent_still_deciding",
  "intent_question_about_scope",
  "intent_not_interested",
  "intent_cancel_or_stop",
] as const;

Deno.serve(async (req) => {
  try {
    const { activity_id, message_body, lead_id } = await req.json();

    if (!activity_id || !message_body) {
      return new Response(
        JSON.stringify({ error: "activity_id and message_body are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify activity exists and is a message_in type
    const { data: activity, error: activityError } = await supabase
      .from("lead_activities")
      .select("id, kind, body, lead_id")
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

    // Use lead_id from activity if not provided
    const finalLeadId = lead_id || activity.lead_id;

    // AI classification prompt with roofing-specific intents
    const prompt = `You are an AI assistant for a roofing company CRM.
Classify the intent of the following homeowner message.

DO NOT include tone. Only intent.

Allowed intents:
- intent_book_estimate: Wants to schedule an estimate, asking when we can come out
- intent_schedule_inspection: Wants to schedule an inspection
- intent_needs_asap_service: Urgent need, leaking, needs immediate service
- intent_request_price: Asking for price, quote, or cost information
- intent_price_shopping: Comparing prices, getting multiple estimates, price-focused
- intent_provide_insurance_info: Providing insurance claim number or adjuster info
- intent_ask_insurance_process: Asking about insurance process or how insurance works
- intent_ready_for_proposal: Ready to move forward, wants proposal sent
- intent_still_deciding: Still thinking about it, not ready to decide
- intent_question_about_scope: Asking questions about work scope or details
- intent_not_interested: Not interested, went with someone else, stop contacting
- intent_cancel_or_stop: Wants to cancel or stop communication

Message: "${message_body}"

Output JSON: { "intent": "..." }`;

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
    let parsed: { intent?: string };

    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      return new Response(
        JSON.stringify({ error: "Failed to parse classification response" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate and normalize intent
    let intent = parsed.intent?.toLowerCase().trim();
    if (!intent || !VALID_INTENTS.includes(intent as any)) {
      // Fallback: try to match partial strings or map common variations
      const matchedIntent = VALID_INTENTS.find((i) => 
        intent?.includes(i.replace("intent_", "")) || 
        i.includes(intent || "")
      );
      intent = matchedIntent || "intent_question_about_scope"; // Default fallback
    }

    // Update activity with intent
    const { error: updateActivityError } = await supabase
      .from("lead_activities")
      .update({
        homeowner_intent: intent,
      })
      .eq("id", activity_id);

    if (updateActivityError) {
      console.error("Error updating lead_activities:", updateActivityError);
      return new Response(
        JSON.stringify({ error: "Failed to update activity classification" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update lead last_intent (trigger should handle this, but doing it explicitly for reliability)
    if (finalLeadId) {
      const { error: updateLeadError } = await supabase
        .from("leads")
        .update({
          last_intent: intent,
        })
        .eq("id", finalLeadId);

      if (updateLeadError) {
        console.error("Error updating leads.last_intent:", updateLeadError);
        // Don't fail the request if lead update fails
      }
    }

    // Create timeline event
    if (finalLeadId) {
      const { error: timelineError } = await supabase
        .from("lead_timeline_events")
        .insert({
          lead_id: finalLeadId,
          event_type: "intent_classified",
          event_subtype: intent,
          message: `Intent classified: ${intent.replace(/intent_/g, "").replace(/_/g, " ")}`,
          metadata: {
            activity_id,
            intent,
            classified_at: new Date().toISOString(),
          },
        });

      if (timelineError) {
        console.error("Error creating timeline event:", timelineError);
        // Don't fail the request if timeline event fails
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        intent,
        activity_id,
        lead_id: finalLeadId,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in classify-intent:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});









































