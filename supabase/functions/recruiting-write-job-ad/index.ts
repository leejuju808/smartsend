// Block 256700 — SmartSend AI Recruiting Engine v1
// Edge Function: AI-Written Job Ads (High-Conversion)
// Generates job ads tailored to roofing roles: laborer, installer, foreman, repair tech, sales rep, project manager

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
    const { job_opening_id, company_id, title, requirements, wage_range, location } = await req.json();

    if (!job_opening_id || !company_id || !title) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: job_opening_id, company_id, title" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get company info for context
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("name, city, state, messaging_style, company_type")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ error: "Company not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt for job ad generation
    const systemPrompt = `You are an expert at writing high-conversion job ads for roofing companies. 
Your job ads attract the BEST workers by being clear, honest, and compelling.

Job ad structure:
1. Headline: Job title + pay range (if provided)
2. Hook: Why work here? (year-round work, fast pay, professional crews)
3. Must Have: Clear requirements (experience, skills, tools)
4. What We Provide: Benefits and perks
5. Call to Action: How to apply

Tone: Professional but approachable. Direct. No fluff.
Target: Experienced roofing workers who want stability and good pay.`;

    const userPrompt = `Write a high-conversion job ad for a roofing position.

Company: ${company.name}
Location: ${location || `${company.city || ""}, ${company.state || ""}`}
Job Title: ${title}
Wage Range: ${wage_range || "Competitive pay"}
Requirements: ${JSON.stringify(requirements || {})}

Job Role Types:
- laborer: Entry-level, physical work, learning opportunity
- installer: Experienced, can install shingles, flashings, tear-off
- foreman: Leadership role, manages crew, quality control
- repair_tech: Specialized repairs, small jobs, detail-oriented
- sales_rep: Customer-facing, estimates, closes deals
- project_manager: Coordinates jobs, manages schedules, customer communication

Generate a job ad that:
1. Attracts qualified applicants (not just anyone)
2. Sets clear expectations
3. Highlights what makes this company/role good
4. Uses roofing-specific terminology
5. Is concise but complete

Return ONLY the job ad text, no markdown formatting, no explanations.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const aiGeneratedAd = completion.choices[0]?.message?.content?.trim() || "";

    if (!aiGeneratedAd) {
      return new Response(
        JSON.stringify({ error: "Failed to generate job ad" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update job opening with AI-generated ad
    const { error: updateError } = await supabase
      .from("job_openings")
      .update({
        ai_generated_ad: aiGeneratedAd,
        ai_ad_version: `v${Date.now()}`,
        description: aiGeneratedAd, // Also update description field
      })
      .eq("id", job_opening_id);

    if (updateError) {
      console.error("Error updating job opening:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save job ad" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_ad: aiGeneratedAd,
        job_opening_id,
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
    console.error("Error in recruiting-write-job-ad:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















