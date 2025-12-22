// Block 256700 — SmartSend AI Recruiting Engine v1
// Edge Function: AI Pre-Interview Assessment
// Automatic assessment — NO PM time wasted. Applicant answers pre-set questions, AI grades them 0-100

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

// Standard pre-interview questions for roofing positions
const STANDARD_QUESTIONS = [
  {
    id: "q1",
    question: "Describe your experience with steep roofs. What's the steepest roof you've worked on?",
    type: "text",
  },
  {
    id: "q2",
    question: "Do you own a safety harness?",
    type: "yes_no",
  },
  {
    id: "q3",
    question: "How do you handle weather delays on a job?",
    type: "text",
  },
  {
    id: "q4",
    question: "Explain how to install step flashing around a chimney.",
    type: "text",
  },
  {
    id: "q5",
    question: "How many years of roofing experience do you have?",
    type: "number",
  },
  {
    id: "q6",
    question: "Have you ever had a workplace safety incident?",
    type: "yes_no",
  },
  {
    id: "q7",
    question: "What's your availability? Can you work full-time, year-round?",
    type: "text",
  },
];

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
    const { applicant_id, answers } = await req.json();

    if (!applicant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: applicant_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get applicant info
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select(`
        id,
        job_opening_id,
        parsed_resume,
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

    // Get or create pre-interview assessment
    let { data: assessment } = await supabase
      .from("pre_interview_assessments")
      .select("*")
      .eq("applicant_id", applicant_id)
      .single();

    const questions = assessment?.questions || STANDARD_QUESTIONS;
    const assessmentAnswers = answers || assessment?.answers || {};

    // If answers provided, update assessment
    if (answers) {
      if (!assessment) {
        const { data: newAssessment } = await supabase
          .from("pre_interview_assessments")
          .insert({
            applicant_id,
            questions,
            answers: assessmentAnswers,
            status: "in_progress",
          })
          .select()
          .single();
        assessment = newAssessment;
      } else {
        const { data: updatedAssessment } = await supabase
          .from("pre_interview_assessments")
          .update({
            answers: assessmentAnswers,
            status: "in_progress",
          })
          .eq("id", assessment.id)
          .select()
          .single();
        assessment = updatedAssessment;
      }
    }

    // If all questions answered, run AI scoring
    if (assessment && Object.keys(assessmentAnswers).length >= questions.length) {
      const systemPrompt = `You are an expert at assessing roofing job applicants through pre-interview questions.

Score applicants on:
1. Steep Roof Knowledge (0-100): Understanding of steep roof work, safety, techniques
2. Safety Awareness (0-100): Safety equipment ownership, incident history, safety mindset
3. Technical Skill (0-100): Knowledge of roofing techniques (flashing, installation, etc.)
4. Reliability Indicators (0-100): Work history consistency, availability, commitment

Return scores and analysis.`;

      const userPrompt = `Assess this roofing applicant's pre-interview answers.

Job Title: ${applicant.job_openings?.title || "Roofing Position"}
Resume Data: ${JSON.stringify(applicant.parsed_resume || {}, null, 2)}

Questions and Answers:
${questions.map((q: any) => `Q: ${q.question}\nA: ${assessmentAnswers[q.id] || "Not answered"}`).join("\n\n")}

Score and analyze. Return JSON:
{
  "steep_roof_knowledge": <0-100>,
  "safety_awareness": <0-100>,
  "technical_skill": <0-100>,
  "reliability_indicators": <0-100>,
  "overall_assessment_score": <0-100>,
  "ai_analysis": "Detailed analysis of applicant's answers",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "red_flags": ["red_flag1"] or []
}

Be strict but fair. Flag inconsistencies between resume and answers.`;

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

      const aiScores = JSON.parse(completion.choices[0]?.message?.content || "{}");

      // Update assessment with AI scores
      const { data: finalAssessment } = await supabase
        .from("pre_interview_assessments")
        .update({
          ai_scores: {
            steep_roof_knowledge: Math.max(0, Math.min(100, aiScores.steep_roof_knowledge || 0)),
            safety_awareness: Math.max(0, Math.min(100, aiScores.safety_awareness || 0)),
            technical_skill: Math.max(0, Math.min(100, aiScores.technical_skill || 0)),
            reliability_indicators: Math.max(0, Math.min(100, aiScores.reliability_indicators || 0)),
          },
          overall_assessment_score: Math.max(0, Math.min(100, aiScores.overall_assessment_score || 0)),
          ai_analysis: aiScores.ai_analysis || "",
          strengths: aiScores.strengths || [],
          weaknesses: aiScores.weaknesses || [],
          red_flags: aiScores.red_flags || [],
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", assessment.id)
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          assessment: finalAssessment,
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
    }

    // Return questions if not all answered
    return new Response(
      JSON.stringify({
        success: true,
        questions,
        answers: assessmentAnswers,
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
    console.error("Error in recruiting-pre-interview-assessment:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















