// Supabase Edge Function: SMS Intent Classification
// Classifies SMS replies using AI

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://deno.land/x/openai@v4.20.1/mod.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

type SMSIntentLabel =
  | "interested"
  | "not_interested"
  | "neutral"
  | "question"
  | "meeting_booked"
  | "ooo"
  | "referral"
  | "opt_out"
  | "other";

Deno.serve(async (req) => {
  try {
    const { message_id } = await req.json();

    if (!message_id) {
      return new Response(
        JSON.stringify({ error: "Missing message_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get message
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("id, body_text, thread_id, phone, channel")
      .eq("id", message_id)
      .single();

    if (messageError || !message) {
      return new Response(
        JSON.stringify({ error: "Message not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (message.channel !== "sms" || !message.body_text) {
      return new Response(
        JSON.stringify({ error: "Invalid message type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for opt-out keywords first
    const optOutKeywords = ["stop", "stopall", "cancel", "end", "quit", "unsubscribe"];
    const normalizedBody = message.body_text.toLowerCase().trim();
    
    let classification: { label: SMSIntentLabel; confidence: number; reason: string };
    
    const isOptOut = optOutKeywords.some(
      (keyword) => normalizedBody === keyword || normalizedBody.startsWith(keyword + " ")
    );

    if (isOptOut) {
      classification = {
        label: "opt_out",
        confidence: 0.95,
        reason: "Detected opt-out keyword",
      };
    } else {
      // Use OpenAI to classify intent
      const systemPrompt = `
You are an expert B2B sales assistant.
Classify the INTENT of this SMS reply in the context of a cold outreach.

You must respond ONLY as JSON:

{
  "label": "...",
  "confidence": 0.0-1.0,
  "reason": "short explanation"
}

Allowed labels:
- interested          (wants to talk, learn more, proceed)
- not_interested      (clearly declines, no for now)
- neutral             (acknowledgement but no clear yes/no)
- question            (asking clarifying questions, but not yet a yes/no)
- meeting_booked      (explicitly confirms a time or meeting)
- ooo                 (out-of-office or auto-response)
- referral            (referring to another person or team)
- other               (anything that doesn't fit)
`;

      const userPrompt = `SMS MESSAGE:\n${message.body_text}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt.trim() },
          { role: "user", content: userPrompt.trim() },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }

      const label: SMSIntentLabel =
        parsed.label && typeof parsed.label === "string"
          ? (parsed.label as SMSIntentLabel)
          : "other";

      const confidence =
        typeof parsed.confidence === "number" &&
        parsed.confidence >= 0 &&
        parsed.confidence <= 1
          ? parsed.confidence
          : 0.5;

      const reason =
        typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : "No reason provided.";

      classification = { label, confidence, reason };
    }

    // Update message with classification
    const { error: updateError } = await supabase
      .from("messages")
      .update({
        ai_label: classification.label,
        ai_score: classification.confidence,
        ai_reason: classification.reason,
      })
      .eq("id", message_id);

    if (updateError) {
      console.error("Error updating message:", updateError);
    }

    // Update thread with classification if it exists
    if (message.thread_id) {
      await supabase
        .from("reply_threads")
        .update({
          ai_label: classification.label,
        })
        .eq("id", message.thread_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        classification,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error classifying SMS intent:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});




























































