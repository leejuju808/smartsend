// Block 22192 — SmartSend Roofing "Win Probability Engine v1"
// Edge Function: Calculate Win Probability for a Job
// Called whenever:
// - health changes
// - momentum changes
// - experience changes
// - risk changes
// - tone/intent changes
// - proposal sent/viewed
// - inspection scheduled/completed
// - stage changes
// - estimator performance updates
// - lead source performance updates
// - timeline events

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4.0.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  // Allow POST requests only
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch full intelligence for the lead
    const { data: lead, error: viewError } = await supabase
      .from("lead_full_intelligence_view")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    if (viewError || !lead) {
      console.error("Error fetching lead intelligence:", viewError);
      
      // Fallback: try fetching directly from leads table
      const { data: fallbackLead, error: fallbackError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (fallbackError || !fallbackLead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Use fallback data with minimal intelligence
      const minimalData = {
        lead_id: fallbackLead.id,
        status: fallbackLead.status,
        pipeline_stage: fallbackLead.pipeline_stage,
        job_health_score: fallbackLead.job_health_score || 50,
        momentum_score: fallbackLead.momentum_score || 50,
        homeowner_experience_score: fallbackLead.homeowner_experience_score || 50,
        risk_category: fallbackLead.risk_category || "medium",
        days_since_last_reply: fallbackLead.last_reply_at 
          ? Math.floor((Date.now() - new Date(fallbackLead.last_reply_at).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      };

      return await calculateProbability(minimalData);
    }

    return await calculateProbability(lead);
  } catch (error: any) {
    console.error("Error in calculate-win-probability:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  async function calculateProbability(leadData: any) {
    // Build comprehensive prompt for OpenAI
    const prompt = `You are SmartSend AI, a roofing sales intelligence system.
Your job is to predict the probability (0-100%) that this roofing job will be WON.

Use ALL available intelligence signals:

HEALTH SIGNALS:
- Job Health Score: ${leadData.job_health_score || 50}/100 (trend: ${leadData.job_health_trend || "stable"})
- Momentum Score: ${leadData.momentum_score || 50}/100 (trend: ${leadData.momentum_trend || "stable"})
- Experience Score: ${leadData.homeowner_experience_score || 50}/100 (trend: ${leadData.experience_trend || "stable"})
- Risk Category: ${leadData.risk_category || "medium"}

CONVERSATION SIGNALS:
- Homeowner Tone: ${leadData.homeowner_tone || "neutral"}
- Latest Intent: ${leadData.latest_intent || "unknown"}
- Days since last reply: ${leadData.days_since_last_reply || "unknown"}
- Days since last message: ${leadData.days_since_last_message || "unknown"}

BEHAVIORAL SIGNALS:
- Days since created: ${leadData.days_since_created || "unknown"}
- Has proposal: ${leadData.has_proposal ? "yes" : "no"}
- Last proposal at: ${leadData.last_proposal_at || "never"}
- Has inspection scheduled: ${leadData.has_inspection ? "yes" : "no"}
- Last inspection at: ${leadData.last_inspection_at || "never"}

ESTIMATOR PERFORMANCE SIGNALS:
- Estimator Performance Score: ${leadData.estimator_performance || 50}/100

LEAD SOURCE SIGNALS:
- Source Quality Score: ${leadData.source_quality_score || 50}/100
- Source Category: ${leadData.source_category || "unknown"}

JOB SAVE STATUS:
- Active Job Save: ${leadData.has_active_save ? "yes" : "no"}
- Save Severity: ${leadData.save_severity || "none"}

PIPELINE STATUS:
- Current Status: ${leadData.status || "unknown"}
- Pipeline Stage: ${leadData.pipeline_stage || "unknown"}

POSITIVE INFLUENCERS (increase probability):
- High health score (75+)
- Improving momentum trend
- Positive homeowner tone
- Fast response times
- Proposal sent and viewed
- Inspection scheduled quickly
- High-performing estimator
- High-quality lead source
- Next action completed

NEGATIVE INFLUENCERS (decrease probability):
- Low health score (<50)
- Declining momentum trend
- Negative/frustrated tone
- Slow response times (ghosting risk)
- Proposal delay
- Stage stagnation
- Low-performing estimator
- Low-quality lead source
- Active job save (critical/high severity)

Calculate a probability score (0-100%) that reflects the REAL chance of winning this job.
Be realistic and data-driven. Consider all signals together.

Respond in JSON format:
{
  "win_probability": <number between 0 and 100>,
  "reason": "Top 3 reasons for this probability score (2-3 sentences, be specific)"
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a roofing sales AI expert. Analyze all intelligence signals and predict the probability (0-100%) that this job will be won. Always respond in valid JSON format with win_probability (number) and reason (string).",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower temperature for more consistent, data-driven predictions
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    let result: { win_probability: number; reason: string };
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      // Fallback to default probability
      result = {
        win_probability: 50,
        reason: "Unable to parse AI prediction. Defaulting to neutral probability.",
      };
    }

    // Validate and clamp probability
    let probability = Math.round(result.win_probability);
    if (isNaN(probability) || probability < 0) probability = 0;
    if (probability > 100) probability = 100;

    // Update lead with win probability
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        win_probability: probability,
        win_probability_reason: result.reason,
        win_probability_updated_at: new Date().toISOString(),
      })
      .eq("id", leadData.lead_id);

    if (updateError) {
      console.error("Error updating win probability:", updateError);
      // Continue anyway - we still want to return the result
    }

    // Add to Timeline
    try {
      await supabase.from("job_timelines").insert({
        lead_id: leadData.lead_id,
        event_type: "probability_updated",
        event_category: "ai_intelligence",
        event_summary: `Win Probability Updated → ${probability}%`,
        event_data: {
          win_probability: probability,
          reason: result.reason,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (timelineError) {
      // Don't fail if timeline log fails, but log it
      console.error("Error logging to job_timelines:", timelineError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_id: leadData.lead_id,
        win_probability: probability,
        reason: result.reason,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});









































