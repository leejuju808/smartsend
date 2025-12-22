// Block 256700 — SmartSend AI Recruiting Engine v1
// Edge Function: Skill & Experience Scoring Engine (0-100)
// Scores applicants on experience, skills, reliability, and culture fit

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

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

  try {
    const { applicant_id } = await req.json();

    if (!applicant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: applicant_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get applicant with parsed resume
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select(`
        id,
        job_opening_id,
        company_id,
        parsed_resume,
        is_referral,
        referral_boost,
        job_openings (
          title,
          requirements
        )
      `)
      .eq("id", applicant_id)
      .single();

    if (applicantError || !applicant) {
      return new Response(
        JSON.stringify({ error: "Applicant not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsedResume = applicant.parsed_resume || {};
    const jobOpening = applicant.job_openings;
    const requirements = jobOpening?.requirements || {};

    // Build AI prompt for scoring
    const systemPrompt = `You are an expert at scoring roofing job applicants on a 0-100 scale.

Score applicants on:
1. Experience Score (0-100): Years of roofing experience, relevant past roles, past employers
2. Skill Score (0-100): Roofing-specific skills (tear-off, shingles, flashing, TPO/EPDM, steep roofs, safety)
3. Reliability Score (0-100): Job hopping patterns, safety history, consistency indicators
4. Culture Fit Score (0-100): Communication style, work ethic indicators, team compatibility

Return scores as numbers 0-100. Be strict but fair.`;

    const userPrompt = `Score this roofing applicant.

Job Title: ${jobOpening?.title || "Roofing Position"}
Job Requirements: ${JSON.stringify(requirements, null, 2)}

Applicant Resume Data:
${JSON.stringify(parsedResume, null, 2)}

Is Referral: ${applicant.is_referral ? "Yes" : "No"}

Calculate and return JSON with:
{
  "experience_score": <0-100>,
  "skill_score": <0-100>,
  "reliability_score": <0-100>,
  "culture_fit_score": <0-100>,
  "overall_score": <0-100>,
  "skill_breakdown": {
    "ridge_valley_experience": "none" | "basic" | "intermediate" | "advanced",
    "starter_underlayment": "none" | "basic" | "intermediate" | "advanced",
    "flashing": "none" | "basic" | "intermediate" | "advanced",
    "tpo_epdm": "none" | "basic" | "intermediate" | "advanced",
    "steep_roofs": "none" | "basic" | "intermediate" | "advanced",
    "safety_awareness": "none" | "basic" | "intermediate" | "advanced"
  },
  "scoring_reasoning": {
    "experience": "Brief explanation",
    "skills": "Brief explanation",
    "reliability": "Brief explanation",
    "culture_fit": "Brief explanation"
  }
}

Overall score should be a weighted average:
- Experience: 25%
- Skills: 35%
- Reliability: 25%
- Culture Fit: 15%

If applicant is a referral, add 5 points to overall_score (but don't exceed 100).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const scoring = JSON.parse(completion.choices[0]?.message?.content || "{}");

    // Apply referral boost if applicable
    let overallScore = Math.max(0, Math.min(100, scoring.overall_score || 0));
    if (applicant.is_referral && applicant.referral_boost) {
      overallScore = Math.min(100, overallScore + applicant.referral_boost);
    }

    // Update applicant with scores
    const { error: updateError } = await supabase
      .from("applicants")
      .update({
        experience_score: Math.max(0, Math.min(100, scoring.experience_score || 0)),
        skill_score: Math.max(0, Math.min(100, scoring.skill_score || 0)),
        reliability_score: Math.max(0, Math.min(100, scoring.reliability_score || 0)),
        culture_fit_score: Math.max(0, Math.min(100, scoring.culture_fit_score || 0)),
        overall_score: overallScore,
        skill_breakdown: scoring.skill_breakdown || {},
      })
      .eq("id", applicant_id);

    if (updateError) {
      console.error("Error updating applicant scores:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save scores" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        scores: {
          experience_score: scoring.experience_score,
          skill_score: scoring.skill_score,
          reliability_score: scoring.reliability_score,
          culture_fit_score: scoring.culture_fit_score,
          overall_score: overallScore,
        },
        skill_breakdown: scoring.skill_breakdown,
        reasoning: scoring.scoring_reasoning,
        applicant_id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in recruiting-score-applicant:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















