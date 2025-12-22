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

    // Fetch full lead data if not provided
    let leadData = lead;
    if (!lead.company_description && !lead.industry) {
      const { data: fullLead, error: fetchError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead.id)
        .single();

      if (fetchError || !fullLead) {
        return new Response(JSON.stringify({ error: "Lead not found" }), { 
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      leadData = fullLead;
    }

    // Build scoring prompt with all available data
    const prompt = `SmartSend Lead Score v2 — AI Model.

Given this enriched lead:

${JSON.stringify({
  email: leadData.email,
  company: leadData.company,
  title: leadData.title,
  company_description: leadData.company_description,
  industry: leadData.industry,
  company_size: leadData.company_size,
  employee_count: leadData.employee_count,
  tech_stack: leadData.tech_stack,
  website: leadData.website,
  open_count: leadData.open_count || 0,
  click_count: leadData.click_count || 0,
  intent_primary: leadData.intent_primary,
  first_name: leadData.first_name,
  last_name: leadData.last_name,
}, null, 2)}

Determine scores for each factor (be precise and analytical):

1. industry_fit (0-30): How well does the industry match typical high-value prospects? Consider if this is a B2B SaaS-friendly industry, growth sectors, etc.

2. company_fit (0-20): Based on company_size, employee_count, and tech_stack - does this match ideal customer profile? Larger companies with modern tech stacks score higher.

3. engagement_score (0-30): Based on open_count and click_count. Higher engagement = higher score. Consider: opens show interest, clicks show strong interest.

4. intent_score (0-20): Based on intent_primary signals. Meeting intent, positive replies, questions score highest. Neutral/no intent scores lower.

5. website_intelligence_score (0-30): Analyze company_description, website content, tech_stack. Look for signals like: innovation focus, hiring, growth, modern stack, remote culture, revenue model clarity.

6. personalization_score (0-20): Can we personalize effectively? Do we have enough data for {{company}}, {{industry}}, {{tech_stack}} personalization? More data = higher score.

7. reply_likelihood (0-10): Overall AI prediction of reply probability based on all factors combined. This is your confidence score.

Return ONLY valid JSON:
{
  "industry_fit": <number 0-30>,
  "company_fit": <number 0-20>,
  "engagement_score": <number 0-30>,
  "intent_score": <number 0-20>,
  "website_intelligence_score": <number 0-30>,
  "personalization_score": <number 0-20>,
  "reply_likelihood": <number 0-10>
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a lead scoring AI assistant. Return only valid JSON with numeric scores." },
        { role: "user", content: prompt }
      ],
      temperature: 0.25,
      response_format: { type: "json_object" }
    });

    const content = completion.choices?.[0]?.message?.content || "{}";
    const scoring = JSON.parse(content);

    // Validate and normalize scores
    const industry_fit = Math.max(0, Math.min(30, Number(scoring.industry_fit) || 0));
    const company_fit = Math.max(0, Math.min(20, Number(scoring.company_fit) || 0));
    const engagement_score = Math.max(0, Math.min(30, Number(scoring.engagement_score) || 0));
    const intent_score = Math.max(0, Math.min(20, Number(scoring.intent_score) || 0));
    const website_intelligence_score = Math.max(0, Math.min(30, Number(scoring.website_intelligence_score) || 0));
    const personalization_score = Math.max(0, Math.min(20, Number(scoring.personalization_score) || 0));
    const reply_likelihood = Math.max(0, Math.min(10, Number(scoring.reply_likelihood) || 0));

    const scoringBreakdown = {
      industry_fit,
      company_fit,
      engagement_score,
      intent_score,
      website_intelligence_score,
      personalization_score,
      reply_likelihood
    };

    // Calculate final score (sum, max 100)
    const final_score = Math.min(100,
      industry_fit +
      company_fit +
      engagement_score +
      intent_score +
      website_intelligence_score +
      personalization_score +
      reply_likelihood
    );

    // Update the lead record
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        scoring_v2: scoringBreakdown,
        score_v2: final_score
      })
      .eq("id", leadData.id);

    if (updateError) {
      console.error("Failed to update lead scoring:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update scoring" }), { 
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      score_v2: final_score,
      scoring_v2: scoringBreakdown
    }), {
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("lead-score-v2 error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { 
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});










