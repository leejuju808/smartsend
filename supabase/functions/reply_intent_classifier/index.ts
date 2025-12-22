// Block 21412 — SmartSend Reply Intent Classifier v1
// Edge Function: reply_intent_classifier
// Classifies homeowner email replies into intent buckets and triggers task generation

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
const edgeBaseUrl = Deno.env.get("EDGE_FUNCTIONS_URL") || 
  supabaseUrl.replace(/\.supabase\.co$/, ".functions.supabase.co");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type IntentLabel =
  | "hot"
  | "warm"
  | "schedule"
  | "followup"
  | "question"
  | "not_interested";

serve({
  "/": async (req: Request) => {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { email_id, user_id, lead_id, subject, text_body } = body;

    if (!email_id || !user_id || !text_body) {
      return new Response(
        "Missing required fields: email_id, user_id, text_body",
        { status: 400 },
      );
    }

    try {
      // 1) Call OpenAI to classify intent
      const prompt = buildClassifierPrompt(subject, text_body);

      const openAiRes = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { 
                role: "system", 
                content: "You are an AI that classifies homeowner email replies for a roofing company CRM. Respond ONLY with valid JSON." 
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
          }),
        },
      );

      if (!openAiRes.ok) {
        const text = await openAiRes.text();
        console.error("OpenAI error:", text);
        return new Response(
          JSON.stringify({ error: "OpenAI error", details: text }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const completion = await openAiRes.json();
      const raw = completion.choices?.[0]?.message?.content ?? "{}";

      let parsed: { intent?: string; confidence?: number; reason?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn("Failed to parse OpenAI response, using fallback");
        parsed = { intent: "followup", confidence: 0.4, reason: "Fallback" };
      }

      const normalizedIntent = normalizeIntent(parsed.intent);

      // 2) Insert into reply_intents
      const { data: intentRow, error: intentError } = await supabase
        .from("reply_intents")
        .insert({
          email_id,
          user_id,
          lead_id: lead_id || null,
          intent: normalizedIntent,
          confidence: parsed.confidence ?? 0.0,
        })
        .select("id")
        .single();

      if (intentError) {
        console.error("reply_intents insert error:", intentError);
        return new Response(
          JSON.stringify({ error: "DB insert error", details: intentError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // 3) Call generate_tasks_from_reply so it can create a task
      try {
        const taskRes = await fetch(`${edgeBaseUrl}/generate_tasks_from_reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email_id,
            user_id,
            lead_id: lead_id || null,
            intent: normalizedIntent,
          }),
        });

        if (!taskRes.ok) {
          const taskError = await taskRes.text();
          console.error("generate_tasks_from_reply call error:", taskError);
          // don't hard-fail classification if task call fails
        }
      } catch (e) {
        console.error("generate_tasks_from_reply call error:", e);
        // don't hard-fail classification if task call fails
      }

      return new Response(
        JSON.stringify({
          status: "classified",
          intent: normalizedIntent,
          confidence: parsed.confidence ?? 0.0,
          reply_intent_id: intentRow?.id,
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 200
        },
      );
    } catch (error) {
      console.error("Unexpected error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error", details: String(error) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
});

function buildClassifierPrompt(subject: string | null, body: string): string {
  return `
Classify this homeowner reply for a roofing company sales inbox.

You MUST respond in this JSON format ONLY:
{
  "intent": "hot" | "warm" | "schedule" | "followup" | "question" | "not_interested",
  "confidence": 0.0-1.0,
  "reason": "short explanation"
}

Definitions:
- "hot": clearly wants to move forward, ready to book, asking to start work or next step.
- "warm": positive but not fully committed, might need more info or time.
- "schedule": explicitly trying to set a time for inspection, estimate, or job.
- "followup": no reply yet OR vague/neutral that needs a gentle follow-up later.
- "question": mainly asking a question about price, warranty, scope, insurance, etc.
- "not_interested": clearly says they are not interested, already hired someone else, or stop contacting.

Email Subject:
${subject ?? "(no subject)"}

Email Body:
${body}
`;
}

function normalizeIntent(intentRaw?: string): IntentLabel {
  const lower = (intentRaw || "").toLowerCase().trim();

  if (["hot", "very_hot", "ready", "book", "go_ahead"].includes(lower)) {
    return "hot";
  }
  if (["warm", "interested", "maybe"].includes(lower)) {
    return "warm";
  }
  if (["schedule", "appointment", "time", "book_time"].includes(lower)) {
    return "schedule";
  }
  if (["question", "info", "clarification"].includes(lower)) {
    return "question";
  }
  if (["not_interested", "no", "stop", "optout"].includes(lower)) {
    return "not_interested";
  }
  // default safety net
  return "followup";
}














































