// Block 256700 — SmartSend AI Recruiting Engine v1
// Edge Function: AI Resume Parsing + Auto-Screening
// Extracts years of experience, tools used, past roles, certifications, safety history, reliability indicators

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
    const { applicant_id, resume_text, resume_url } = await req.json();

    if (!applicant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: applicant_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get applicant info
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("id, job_opening_id, company_id")
      .eq("id", applicant_id)
      .single();

    if (applicantError || !applicant) {
      return new Response(
        JSON.stringify({ error: "Applicant not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get job opening requirements for context
    const { data: jobOpening } = await supabase
      .from("job_openings")
      .select("title, requirements")
      .eq("id", applicant.job_opening_id)
      .single();

    if (!resume_text && !resume_url) {
      return new Response(
        JSON.stringify({ error: "Either resume_text or resume_url is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let resumeContent = resume_text;

    // If resume_url provided, fetch and extract text (simplified - in production, use proper PDF parsing)
    if (resume_url && !resume_text) {
      // Note: In production, you'd want to use a proper PDF/text extraction service
      // For now, we'll assume resume_text is provided
      resumeContent = resume_text || "Resume content not available";
    }

    // Build AI prompt for resume parsing
    const systemPrompt = `You are an expert at parsing resumes for roofing industry positions. 
Extract structured information that helps evaluate candidate fit for roofing roles.

Focus on:
- Years of roofing experience (specific number)
- Past roles (laborer, installer, foreman, etc.)
- Past employers (roofing companies)
- Tools used (nail gun, circular saw, harness, etc.)
- Certifications (OSHA, GAF, CertainTeed, etc.)
- Safety history (any incidents, clean record, etc.)
- Job hopping patterns (frequent job changes = low reliability)
- Roofing-specific keywords and skills

Return structured JSON with all extracted information.`;

    const userPrompt = `Parse this resume for a roofing position application.

Job Title: ${jobOpening?.title || "Roofing Position"}
Job Requirements: ${JSON.stringify(jobOpening?.requirements || {})}

Resume Content:
${resumeContent}

Extract and return JSON with this structure:
{
  "years_experience": <number>,
  "past_roles": ["role1", "role2"],
  "past_employers": ["company1", "company2"],
  "tools_used": ["tool1", "tool2"],
  "certifications": ["cert1", "cert2"],
  "safety_history": "clean" | "incidents" | "unknown",
  "job_hopping_pattern": "low" | "medium" | "high",
  "keywords": ["keyword1", "keyword2"],
  "roofing_skills": {
    "tear_off": "none" | "basic" | "intermediate" | "advanced",
    "shingles": "none" | "basic" | "intermediate" | "advanced",
    "flashing": "none" | "basic" | "intermediate" | "advanced",
    "tpo_epdm": "none" | "basic" | "intermediate" | "advanced",
    "steep_roofs": "none" | "basic" | "intermediate" | "advanced",
    "safety_awareness": "none" | "basic" | "intermediate" | "advanced"
  },
  "summary": "Brief summary of candidate's roofing background"
}

If information is not found, use null or "unknown" as appropriate.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 1500,
    });

    const parsedResume = JSON.parse(completion.choices[0]?.message?.content || "{}");

    // Update applicant with parsed resume
    const { error: updateError } = await supabase
      .from("applicants")
      .update({
        parsed_resume: parsedResume,
      })
      .eq("id", applicant_id);

    if (updateError) {
      console.error("Error updating applicant:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save parsed resume" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        parsed_resume: parsedResume,
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
    console.error("Error in recruiting-parse-resume:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















