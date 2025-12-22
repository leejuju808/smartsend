// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: Sales Coaching (On-Call AI)
// Provides instant coaching advice for sales situations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      scenario,
      workspace_id,
      user_id,
      context, // Optional additional context (proposal_id, lead_id, etc.)
    } = await req.json();

    if (!scenario || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "scenario and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get additional context if provided
    let contextInfo = "";
    if (context?.proposal_id) {
      const { data: proposal } = await supabase
        .from("proposals")
        .select(`
          id,
          amount,
          status,
          leads:lead_id(
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq("id", context.proposal_id)
        .single();

      if (proposal) {
        contextInfo += `Proposal: $${proposal.amount}, Status: ${proposal.status}\n`;
        if (proposal.leads) {
          contextInfo += `Homeowner: ${proposal.leads.first_name} ${proposal.leads.last_name}\n`;
        }
      }
    }

    // Build AI prompt for sales coaching
    const prompt = `You are SmartSend AI — an elite roofing sales coach and mentor.

A sales rep needs help with this situation:

SCENARIO:
${scenario}

${contextInfo ? `ADDITIONAL CONTEXT:\n${contextInfo}` : ""}

Provide comprehensive coaching that includes:

1. WHAT_TO_SAY: The exact words/phrases to use (be specific and conversational)
2. HOW_TO_SAY_IT: Tone, pace, body language, delivery tips
3. ANGLE_TO_USE: The strategic angle or approach to take
4. PSYCHOLOGY_TO_APPLY: The psychological principle or technique to leverage
5. WHAT_NOT_TO_SAY: Things to avoid saying (common mistakes)
6. HOW_TO_CLOSE: Specific closing strategy or next step

RULES:
- Be practical and actionable
- Use roofing industry knowledge
- Focus on building trust and removing risk
- Be empathetic and understanding
- Provide specific examples, not generic advice
- Consider the homeowner's perspective
- Help the rep feel confident

Return ONLY valid JSON in this exact format:
{
  "what_to_say": "...",
  "how_to_say_it": "...",
  "angle_to_use": "...",
  "psychology_to_apply": "...",
  "what_not_to_say": "...",
  "how_to_close": "..."
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are SmartSend AI, an expert roofing sales coach. Always return valid JSON with the exact fields specified.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save coaching log
    const { data: coachingLog, error: dbError } = await supabase
      .from("sales_coaching_logs")
      .insert({
        user_id: user_id || null,
        workspace_id,
        scenario,
        ai_advice: JSON.stringify(parsed),
        what_to_say: parsed.what_to_say || "",
        how_to_say_it: parsed.how_to_say_it || "",
        angle_to_use: parsed.angle_to_use || "",
        psychology_to_apply: parsed.psychology_to_apply || "",
        what_not_to_say: parsed.what_not_to_say || "",
        how_to_close: parsed.how_to_close || "",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Still return the AI response even if DB save fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        coaching_id: coachingLog?.id || null,
        ...parsed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































