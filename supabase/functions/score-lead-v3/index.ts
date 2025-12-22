import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.58.1";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { 
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(JSON.stringify({ error: "Missing lead" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    if (!lead.embedding) {
      return new Response(JSON.stringify({ error: "Lead has no embedding" }), { 
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    // Get similar leads using RPC function
    const { data: similar, error: similarError } = await supabase.rpc("similar_leads", {
      target_embedding: lead.embedding,
      limit_count: 50
    });

    if (similarError) {
      console.error("Failed to get similar leads:", similarError);
      return new Response(JSON.stringify({ error: "Failed to get similar leads" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    // Build AI prompt for scoring
    const similarSummary = similar?.slice(0, 20).map((s: any) => ({
      similarity: s.similarity?.toFixed(3),
      score_v2: s.score_v2,
      intent: s.intent_primary,
      replied: s.reply_detected,
      meeting: s.meeting_booked
    })) || [];

    const prompt = `You are SmartSend Score v3, an ML-powered lead scoring system.

Here is the target lead:
${JSON.stringify({
  name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
  company: lead.guessed_company || lead.company,
  industry: lead.guessed_industry || lead.industry,
  title: lead.guessed_title || lead.title,
  company_size: lead.company_size,
  employee_count: lead.employee_count,
  tech_stack: lead.tech_stack,
  description: lead.company_description
}, null, 2)}

Here are the 20 most similar leads with historical outcomes:
${JSON.stringify(similarSummary, null, 2)}

Analyze:
1. Probability of reply (0-1): Based on similarity to leads that replied, industry patterns, company size, title relevance
2. Probability of meeting (0-1): Based on similarity to leads that booked meetings, intent signals, engagement patterns
3. Final score v3 (0-100): Weighted combination of:
   - Similarity to successful leads (40%)
   - Historical reply patterns (30%)
   - Lead quality signals (company size, title, industry) (20%)
   - Engagement potential (10%)

Return JSON only:
{
  "prob_reply": <number between 0 and 1>,
  "prob_meeting": <number between 0 and 1>,
  "score_v3": <integer between 0 and 100>
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a lead scoring AI. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const result = JSON.parse(content);

    // Validate and normalize results
    const prob_reply = Math.max(0, Math.min(1, parseFloat(result.prob_reply) || 0));
    const prob_meeting = Math.max(0, Math.min(1, parseFloat(result.prob_meeting) || 0));
    const score_v3 = Math.max(0, Math.min(100, parseInt(result.score_v3) || 0));

    // Update lead with v3 scores
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        probability_reply: prob_reply,
        probability_meeting: prob_meeting,
        score_v3: score_v3
      })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Failed to update lead scores:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update scores" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      prob_reply,
      prob_meeting,
      score_v3
    }), {
      headers: { "content-type": "application/json" }
    });
  } catch (error: any) {
    console.error("score-lead-v3 error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});










