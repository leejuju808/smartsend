// Block 22237 — SmartSend Roofing "Homeowner Experience Score v2"
// Edge Function: Calculate Experience Score (0-100) with AI-powered emotional intelligence
// Called whenever:
// - new messages arrive
// - tone updates
// - intent updates
// - proposal delays happen
// - momentum changes
// - stage friction occurs
// - hot lead cooling detected
// - estimator behavior changes

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
        homeowner_experience_score: fallbackLead.homeowner_experience_score || 50,
        homeowner_tone: fallbackLead.homeowner_tone || "neutral",
        last_message_at: fallbackLead.last_message_at,
        last_reply_at: fallbackLead.last_reply_at,
      };

      return await calculateExperienceScore(minimalData);
    }

    // Fetch transcript messages
    const { data: transcript, error: transcriptError } = await supabase
      .from("transcript_messages")
      .select("*")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true });

    if (transcriptError) {
      console.error("Error fetching transcript:", transcriptError);
      // Continue without transcript - we'll use other signals
    }

    return await calculateExperienceScore(lead, transcript || []);
  } catch (error: any) {
    console.error("Error in calculate-experience-score-v2:", error);
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

  async function calculateExperienceScore(leadData: any, transcript: any[] = []) {
    // Get current experience score for trend calculation
    const currentScore = leadData.homeowner_experience_score || 50;

    // Build comprehensive prompt for OpenAI
    const prompt = `You are SmartSend AI, a roofing sales intelligence system.
Your job is to calculate the Homeowner Experience Score (0-100) — the emotional satisfaction level of the homeowner.

EXPERIENCE SCORE RANGES:
- 85-100: Excellent Experience (confident, cooperative, responsive, positive tone, showing buying signs)
- 60-84: Good Experience (comfortable but not fully bought in)
- 40-59: Neutral / Slipping (hesitation, confusion, inconsistent tone, slower replies)
- 20-39: Negative Experience (frustrated, overwhelmed, uncertain, questioning price, showing objections)
- 0-19: Critical Experience (likely to ghost, choose competitor, reject proposal, escalate complaints)

USE ALL AVAILABLE SIGNALS:

1. TONE TRENDS:
- Current tone: ${leadData.homeowner_tone || "neutral"}
- Transcript tone history: ${transcript.map((m: any) => `${m.tone || "neutral"}`).join(", ") || "none"}

2. INTENT CLASSIFICATION:
- Latest intent: ${leadData.latest_intent || "unknown"}
- Intent trend: Analyze transcript for buying signals vs price sensitivity vs disinterest

3. RESPONSE TIMING:
- Days since last reply: ${leadData.days_since_last_reply || "unknown"}
- Days since last message: ${leadData.days_since_last_message || "unknown"}
- Fast replies = positive, Slow replies = negative

4. ESTIMATOR BEHAVIOR:
- Estimator performance: ${leadData.estimator_performance || 50}/100
- Slow follow-up reduces experience score

5. PROPOSAL TIMING:
- Has proposal: ${leadData.has_proposal ? "yes" : "no"}
- Last proposal at: ${leadData.last_proposal_at || "never"}
- Late proposal = negative experience

6. HOT LEAD COOLING:
- Is hot lead: ${leadData.is_hot || false}
- If hot lead becomes slow = big negative drop

7. STAGE FRICTION:
- Pipeline stage: ${leadData.pipeline_stage || "unknown"}
- Days in stage: ${leadData.days_since_created || "unknown"}
- Stalled job → score drops

8. MESSAGE CONTENT FEATURES:
Transcript messages:
${transcript.length > 0 ? transcript.map((m: any, i: number) => 
  `Message ${i + 1} (${m.sender_type}): ${m.message_text?.substring(0, 200) || ""} [Tone: ${m.tone || "neutral"}, Intent: ${m.intent || "unknown"}]`
).join("\n") : "No transcript messages available"}

- Questions = neutral
- Objections = slight negative
- Frustration words = heavy negative

9. TRANSCRIPT SENTIMENT FLOW:
- Analyze sentiment progression: positive → rising, neutral → steady, negative → falling
- Sentiment scores: ${transcript.map((m: any) => m.sentiment_score || "N/A").join(", ") || "none"}

10. RISK SIGNALS:
- Risk category: ${leadData.risk_category || "medium"}
- Risk score: ${leadData.risk_score || 50}
- Higher risk lowers experience score

11. MOMENTUM:
- Momentum score: ${leadData.momentum_score || 50}/100
- Momentum trend: ${leadData.momentum_trend || "stable"}
- High momentum lifts experience

12. JOB SAVE STATUS:
- Active job save: ${leadData.has_active_save ? "yes" : "no"}
- Save severity: ${leadData.save_severity || "none"}
- Active save = critical experience drop

13. COMMUNICATION CLARITY:
- Analyze transcript for confusion signals (repeated questions, misunderstandings)
- Clear communication = higher score

14. TRUST INDICATORS:
- Responsiveness to estimator
- Engagement level
- Buying signals vs objections

POSITIVE FACTORS (increase score):
- Positive/cooperative tone
- Fast response times
- Buying signals in messages
- High momentum
- Proposal sent on time
- Clear communication
- High estimator performance
- Low risk signals

NEGATIVE FACTORS (decrease score):
- Frustrated/negative tone
- Slow response times (ghosting risk)
- Objections in messages
- Late proposal delivery
- Stage stagnation
- Confusion signals (repeated questions)
- High risk signals
- Active job save
- Hot lead cooling

Calculate an experience score (0-100) that reflects the REAL emotional state of the homeowner.
Be realistic and data-driven. Consider all signals together.

Respond in JSON format:
{
  "experience_score": <number between 0 and 100>,
  "trend": <number between -20 and +20, representing change from current score>,
  "reason": "Top 3 factors influencing this score (2-3 sentences, be specific)"
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a roofing sales AI expert specializing in emotional intelligence. Analyze all signals to calculate the homeowner's experience score (0-100) and trend (-20 to +20). Always respond in valid JSON format with experience_score (number), trend (number), and reason (string).",
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

    let result: { experience_score: number; trend: number; reason: string };
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      // Fallback to default score
      result = {
        experience_score: currentScore,
        trend: 0,
        reason: "Unable to parse AI prediction. Maintaining current score.",
      };
    }

    // Validate and clamp experience score
    let experienceScore = Math.round(result.experience_score);
    if (isNaN(experienceScore) || experienceScore < 0) experienceScore = 0;
    if (experienceScore > 100) experienceScore = 100;

    // Validate and clamp trend (-20 to +20)
    let trend = Math.round(result.trend);
    if (isNaN(trend) || trend < -20) trend = -20;
    if (trend > 20) trend = 20;

    // Calculate text trend for compatibility with v1
    const textTrend = trend > 0 ? "improving" : trend < 0 ? "declining" : "stable";

    // Update lead with experience score
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        homeowner_experience_score: experienceScore,
        experience_score_trend: trend,
        experience_trend: textTrend,
        experience_last_updated: new Date().toISOString(),
        last_experience_update: new Date().toISOString(), // Also update v1 field for compatibility
      })
      .eq("id", leadData.lead_id);

    if (updateError) {
      console.error("Error updating experience score:", updateError);
      // Continue anyway - we still want to return the result
    }

    // Add to Timeline
    try {
      await supabase.from("job_timelines").insert({
        lead_id: leadData.lead_id,
        event_type: "experience_score_updated",
        event_category: "ai_intelligence",
        event_summary: `Experience Score: ${experienceScore} (${trend >= 0 ? "+" : ""}${trend})`,
        event_data: {
          experience_score: experienceScore,
          trend: trend,
          reason: result.reason,
          previous_score: currentScore,
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
        experience_score: experienceScore,
        trend: trend,
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









































