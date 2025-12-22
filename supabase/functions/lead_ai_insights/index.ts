// Block 26590 — SmartSend Roofing Lead Timeline AI Insights v1
// Edge Function: Generate AI insights for roofing leads

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req: Request) => {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pull full conversation context from transcript_messages
    const { data: messages, error: messagesError } = await supabase
      .from("transcript_messages")
      .select("message_text, sender_type, sender_name, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      // Fallback to unified_messages if transcript_messages doesn't have data
      const { data: fallbackMessages } = await supabase
        .from("unified_messages")
        .select("body_text, direction, created_at")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: true });

      if (!fallbackMessages || fallbackMessages.length === 0) {
        // Try reply_threads as another fallback
        const { data: threads } = await supabase
          .from("reply_threads")
          .select("snippet, last_message_at")
          .eq("lead_id", lead_id)
          .order("last_message_at", { ascending: true });

        if (!threads || threads.length === 0) {
          return new Response(
            JSON.stringify({ error: "No conversation data found for this lead" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          );
        }

        // Build conversation from threads
        const convo = threads
          .map((t: any) => `${t.last_message_at}: ${t.snippet || ""}`)
          .join("\n\n");

        return await generateInsights(lead_id, convo);
      }

      const convo = fallbackMessages
        .map((m: any) => `${m.created_at}: ${m.body_text || ""}`)
        .join("\n\n");

      return await generateInsights(lead_id, convo);
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No conversation data found for this lead" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build conversation string
    const convo = messages
      .map((m: any) => {
        const sender = m.sender_name || m.sender_type || "Unknown";
        const timestamp = new Date(m.created_at).toLocaleString();
        return `${timestamp} [${sender}]: ${m.message_text}`;
      })
      .join("\n\n");

    return await generateInsights(lead_id, convo);
  } catch (error: any) {
    console.error("Error in lead_ai_insights:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function generateInsights(lead_id: string, conversation: string) {
  const prompt = `You are a roofing sales assistant AI.

Analyze the conversation below and extract:

1. Short summary (2–4 sentences) - Context, pain points, key phrases, urgency
2. Buying intent (High / Medium / Low) + 1 sentence reason - e.g., "High intent — mentions leak & urgency" or "Medium intent — gathering quotes" or "Low intent — informational only"
3. Objections (price, timeline, insurance confusion, hesitation, etc.) - List any objections or concerns mentioned
4. Best sales angle (speed, warranty, insurance expertise, price, trust, etc.) - Tell the roofer EXACTLY how to respond, e.g., "Use insurance claim expertise angle" or "Lead cares about speed — offer same-day inspection" or "Lead cares about warranty — emphasize 10-year workmanship"
5. Recommended next action (call, send estimate, send inspection scheduler, re-engage with value message, nurture, etc.)

Conversation:
${conversation}

Respond in JSON format only:
{
  "summary": "...",
  "buying_intent": "...",
  "intent_score": 0-100,
  "objections": "...",
  "recommended_angle": "...",
  "next_action": "..."
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  let insights;
  try {
    insights = JSON.parse(content);
  } catch (e) {
    // Try to extract JSON if wrapped in markdown
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      insights = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Failed to parse AI response");
    }
  }

  // Validate and normalize insights
  const validatedInsights = {
    summary: insights.summary || "No summary available.",
    buying_intent: insights.buying_intent || "Unknown",
    intent_score: Math.max(0, Math.min(100, parseInt(insights.intent_score) || 50)),
    objections: insights.objections || "None detected.",
    recommended_angle: insights.recommended_angle || "Standard follow-up approach.",
    next_action: insights.next_action || "Continue nurturing.",
  };

  // Upsert insights into database
  const { error: upsertError } = await supabase
    .from("roofing_lead_ai_insights")
    .upsert(
      {
        lead_id,
        summary: validatedInsights.summary,
        buying_intent: validatedInsights.buying_intent,
        intent_score: validatedInsights.intent_score,
        objections: validatedInsights.objections,
        recommended_angle: validatedInsights.recommended_angle,
        next_action: validatedInsights.next_action,
      },
      {
        onConflict: "lead_id",
      }
    );

  if (upsertError) {
    console.error("Error upserting insights:", upsertError);
    // Still return the insights even if database write fails
  }

  return new Response(
    JSON.stringify(validatedInsights),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
