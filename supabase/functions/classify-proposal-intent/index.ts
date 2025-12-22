// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// Edge Function: classify-proposal-intent
// Triggered when homeowner replies after receiving a proposal
// Classifies homeowner intent and updates proposal record

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  try {
    const { proposal_id, lead_id, workspace_id, message } = await req.json();

    if (!proposal_id || !lead_id || !workspace_id || !message) {
      return new Response(
        JSON.stringify({ error: "proposal_id, lead_id, workspace_id, and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify proposal exists
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, lead_id, workspace_id, amount")
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // AI classification prompt
    const prompt = `You classify homeowner intent after receiving a roofing proposal.

Categories:
- HOT: ready to schedule, wants to move forward, ready to book, wants to proceed
- WARM: has questions, comparing quotes, needs clarification, still interested but needs more info
- COLD: price too high, not ready, delaying, needs to think about it, timing isn't right
- DECLINE: choosing another contractor, not interested, went with someone else, stop contacting

Message: "${message}"

Return JSON with intent and confidence (0.0 to 1.0): {intent, confidence}`;

    // Call OpenAI for classification
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a classification assistant for a roofing CRM. Return only valid JSON with 'intent' and 'confidence' fields.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");

    // Validate intent
    const validIntents = ["HOT", "WARM", "COLD", "DECLINE"];
    if (!validIntents.includes(result.intent)) {
      return new Response(
        JSON.stringify({ error: `Invalid intent: ${result.intent}. Must be one of: ${validIntents.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate confidence
    const confidence = parseFloat(result.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      return new Response(
        JSON.stringify({ error: `Invalid confidence: ${result.confidence}. Must be between 0.0 and 1.0` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update proposal record
    const { error: updateError } = await supabase
      .from("proposals")
      .update({
        intent: result.intent,
        confidence: confidence,
      })
      .eq("id", proposal_id);

    if (updateError) {
      console.error("Error updating proposal:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update proposal", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log event
    const { error: eventError } = await supabase
      .from("proposal_events")
      .insert({
        proposal_id,
        lead_id,
        workspace_id,
        event_type: "proposal_reply",
        metadata: {
          message,
          intent: result.intent,
          confidence: confidence,
        },
      });

    if (eventError) {
      console.error("Error logging proposal event:", eventError);
      // Don't fail the request if event logging fails
    }

    // Also add to lead timeline if lead_timeline_events table exists
    try {
      await supabase
        .from("lead_timeline_events")
        .insert({
          lead_id,
          event_type: "proposal_reply",
          event_subtype: `ai_classified_${result.intent.toLowerCase()}`,
          message: `AI marked proposal reply as ${result.intent} — ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`,
          metadata: {
            proposal_id,
            intent: result.intent,
            confidence: confidence,
          },
        });
    } catch (timelineError) {
      // Timeline table might not exist, that's okay
      console.log("Could not add to timeline (table may not exist):", timelineError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          intent: result.intent,
          confidence: confidence,
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in classify-proposal-intent:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});








































