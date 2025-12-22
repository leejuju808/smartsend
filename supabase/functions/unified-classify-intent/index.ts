// Block 29110 — SmartSend Roofing "AI Inbox + Intent Brain" v1
// Unified Intent Classification for Inbox Messages
// Classifies homeowner messages into 8 roofing-specific intent categories

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

// Valid intent categories for unified inbox
const VALID_INTENTS = [
  "hot_lead",
  "warm_lead",
  "not_interested",
  "follow_up_required",
  "appointment_request",
  "price_question",
  "referral",
  "general",
  "unknown"
] as const;

type Intent = typeof VALID_INTENTS[number];

Deno.serve(async (req) => {
  try {
    const { message_id, body } = await req.json();

    if (!message_id || !body) {
      return new Response(
        JSON.stringify({ error: "message_id and body are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get message details
    const { data: message, error: messageError } = await supabase
      .from("inbox_messages")
      .select("id, body, intent, workspace_id, lead_id")
      .eq("id", message_id)
      .single();

    if (messageError || !message) {
      return new Response(
        JSON.stringify({ error: "Message not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Previous intent for tracking changes
    const previousIntent = message.intent || null;

    // AI classification prompt
    const prompt = `You are an AI assistant for a roofing company CRM analyzing customer messages.

Classify the customer's intent into EXACTLY one of these categories:

1. hot_lead - "Yes," "Call me," "Book us," "We're ready," urgent needs, ready to move forward immediately
2. warm_lead - "More info?" "Send price range," "Can you explain?" interested but needs more information
3. not_interested - "We hired someone," "No thanks," "Stop messaging," explicitly not interested
4. follow_up_required - "Maybe later," "Check back next month," interested but timing isn't right
5. appointment_request - "When can you come give an estimate?" "Can you schedule an inspection?"
6. price_question - "How much?" "What's the price?" "Cost?" asking about pricing
7. referral - "My neighbor needs a roof," "I know someone who needs work," referral message
8. general - Questions about process, materials, timeline, or anything else

Message: "${body}"

Return ONLY the intent label (one word, lowercase with underscore, e.g., "hot_lead").`;

    // Call OpenAI for classification
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a classification assistant. Return only the intent label, nothing else.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
    });

    const responseText = completion.choices[0]?.message?.content?.trim().toLowerCase() || "unknown";
    
    // Clean up response (remove quotes, extra text)
    let intent: Intent = "unknown";
    const cleanedResponse = responseText.replace(/['"]/g, "").trim();
    
    // Validate intent
    if (VALID_INTENTS.includes(cleanedResponse as Intent)) {
      intent = cleanedResponse as Intent;
    } else {
      // Try to match partial strings
      const matched = VALID_INTENTS.find(i => 
        cleanedResponse.includes(i.replace("_", "")) || 
        i.includes(cleanedResponse)
      );
      intent = matched || "general";
    }

    // Calculate confidence (simple heuristic - in production, you might use model confidence scores)
    const confidence = 0.9; // GPT-4o-mini is reliable for this task

    // Update message with intent
    const { error: updateError } = await supabase
      .from("inbox_messages")
      .update({
        intent,
        classified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", message_id);

    if (updateError) {
      console.error("Error updating inbox_messages:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update message classification" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log intent classification
    const { error: logError } = await supabase
      .from("intent_logs")
      .insert({
        message_id,
        workspace_id: message.workspace_id,
        predicted_intent: intent,
        confidence,
        previous_intent: previousIntent,
        ai_model: "gpt-4o-mini",
        classification_prompt: prompt,
        raw_ai_response: {
          response: responseText,
          model: "gpt-4o-mini",
        },
      });

    if (logError) {
      console.error("Error logging intent:", logError);
      // Don't fail the request if logging fails
    }

    // Trigger workflow routing via separate function
    // This will be called asynchronously to avoid blocking
    try {
      const routerUrl = new URL("/functions/v1/intent-router", Deno.env.get("SUPABASE_URL")!);
      await fetch(routerUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          lead_id: message.lead_id,
          intent,
          message_id,
        }),
      }).catch(err => {
        console.error("Error calling intent-router:", err);
        // Don't fail the request if routing fails
      });
    } catch (routerErr) {
      console.error("Intent router error:", routerErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        intent,
        confidence,
        message_id,
        previous_intent: previousIntent,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in unified-classify-intent:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});


































