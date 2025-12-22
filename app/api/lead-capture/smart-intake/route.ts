// Block 19900 — Smart Intake Parser
// POST /api/lead-capture/smart-intake
// AI-powered lead analysis and intelligence

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      workspace_id,
      contact_id,
      thread_id,
      source_type,
      source_id,
      submission_data,
    } = body;

    if (!workspace_id || !contact_id || !source_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Build analysis prompt from submission data
    const analysisText = buildAnalysisText(submission_data);

    // Call AI for analysis
    const aiAnalysis = await analyzeLeadWithAI(analysisText);

    // Store analysis results
    const { data: analysis, error: analysisError } = await supabase
      .from("smart_intake_analysis")
      .insert({
        workspace_id,
        contact_id,
        thread_id: thread_id || null,
        source_type,
        source_id: source_id || null,
        detected_job_types: aiAnalysis.job_types || [],
        urgency_level: aiAnalysis.urgency_level || "medium",
        expected_job_value: aiAnalysis.expected_job_value || null,
        lead_score: aiAnalysis.lead_score || 50,
        missing_info: aiAnalysis.missing_info || {},
        suggested_next_steps: aiAnalysis.next_steps || [],
        ai_analysis: aiAnalysis.full_analysis || {},
      })
      .select()
      .single();

    if (analysisError) {
      console.error("Error storing analysis:", analysisError);
      return NextResponse.json(
        { error: "Failed to store analysis" },
        { status: 500 }
      );
    }

    // Update contact with lead score if available
    if (aiAnalysis.lead_score) {
      await supabase
        .from("contacts")
        .update({
          source_meta: {
            lead_score: aiAnalysis.lead_score,
            urgency_level: aiAnalysis.urgency_level,
          },
        })
        .eq("id", contact_id);
    }

    return NextResponse.json({
      success: true,
      analysis: {
        job_types: aiAnalysis.job_types,
        urgency_level: aiAnalysis.urgency_level,
        lead_score: aiAnalysis.lead_score,
        missing_info: aiAnalysis.missing_info,
        next_steps: aiAnalysis.next_steps,
      },
    });
  } catch (error: any) {
    console.error("Error in Smart Intake Parser:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Build analysis text from submission data
function buildAnalysisText(submissionData: any): string {
  const parts = [];

  if (submissionData.job_type) {
    parts.push(`Job Type: ${submissionData.job_type}`);
  }

  if (submissionData.description) {
    parts.push(`Description: ${submissionData.description}`);
  }

  if (submissionData.address) {
    parts.push(`Address: ${submissionData.address}`);
  }

  if (submissionData.preferred_time) {
    parts.push(`Preferred Time: ${submissionData.preferred_time}`);
  }

  return parts.join("\n");
}

// Analyze lead with AI
async function analyzeLeadWithAI(text: string): Promise<{
  job_types: string[];
  urgency_level: string;
  expected_job_value: number | null;
  lead_score: number;
  missing_info: Record<string, boolean>;
  next_steps: string[];
  full_analysis: any;
}> {
  try {
    // Use OpenAI or your AI provider
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.warn("OpenAI API key not found, using fallback analysis");
      return getFallbackAnalysis(text);
    }

    const prompt = `You are a roofing lead intelligence system. Analyze this lead information and provide structured insights:

Lead Information:
${text}

Provide a JSON response with:
1. detected_job_types: array of detected job types (e.g., ["leak", "storm_damage", "insurance_claim", "replacement", "gutter_issue", "inspection"])
2. urgency_level: one of "low", "medium", "high", "urgent"
3. expected_job_value: estimated job value in dollars (null if cannot estimate)
4. lead_score: 0-100 score indicating lead quality
5. missing_info: object with boolean flags for missing information (address, photos, timeline)
6. suggested_next_steps: array of suggested actions (e.g., ["call", "send_insurance_instructions", "schedule_inspection", "send_estimator"])

Respond ONLY with valid JSON, no other text.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a roofing lead intelligence system. Always respond with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON response
    const analysis = JSON.parse(content);

    return {
      job_types: analysis.detected_job_types || [],
      urgency_level: analysis.urgency_level || "medium",
      expected_job_value: analysis.expected_job_value || null,
      lead_score: analysis.lead_score || 50,
      missing_info: analysis.missing_info || {},
      next_steps: analysis.suggested_next_steps || [],
      full_analysis: analysis,
    };
  } catch (error) {
    console.error("Error analyzing with AI:", error);
    return getFallbackAnalysis(text);
  }
}

// Fallback analysis when AI is unavailable
function getFallbackAnalysis(text: string): {
  job_types: string[];
  urgency_level: string;
  expected_job_value: number | null;
  lead_score: number;
  missing_info: Record<string, boolean>;
  next_steps: string[];
  full_analysis: any;
} {
  const lowerText = text.toLowerCase();
  const jobTypes: string[] = [];

  if (lowerText.includes("leak") || lowerText.includes("leaking")) {
    jobTypes.push("leak");
  }
  if (
    lowerText.includes("storm") ||
    lowerText.includes("hail") ||
    lowerText.includes("wind")
  ) {
    jobTypes.push("storm_damage");
  }
  if (lowerText.includes("insurance")) {
    jobTypes.push("insurance_claim");
  }
  if (lowerText.includes("replace") || lowerText.includes("new roof")) {
    jobTypes.push("replacement");
  }
  if (lowerText.includes("gutter")) {
    jobTypes.push("gutter_issue");
  }
  if (lowerText.includes("inspect")) {
    jobTypes.push("inspection");
  }

  // Determine urgency
  let urgency = "medium";
  if (lowerText.includes("urgent") || lowerText.includes("emergency")) {
    urgency = "urgent";
  } else if (lowerText.includes("leak") || lowerText.includes("water")) {
    urgency = "high";
  }

  // Determine missing info
  const missingInfo: Record<string, boolean> = {
    address: !text.includes("address") && !text.match(/\d+\s+\w+/),
    photos: !lowerText.includes("photo") && !lowerText.includes("image"),
    timeline: !lowerText.includes("time") && !lowerText.includes("when"),
  };

  // Suggest next steps
  const nextSteps: string[] = ["call"];
  if (jobTypes.includes("insurance_claim")) {
    nextSteps.push("send_insurance_instructions");
  }
  if (jobTypes.includes("inspection")) {
    nextSteps.push("schedule_inspection");
  }
  if (urgency === "urgent" || urgency === "high") {
    nextSteps.push("send_estimator");
  }

  // Calculate lead score
  let leadScore = 50;
  if (jobTypes.length > 0) leadScore += 10;
  if (urgency === "high" || urgency === "urgent") leadScore += 20;
  if (!missingInfo.address) leadScore += 10;
  if (!missingInfo.photos) leadScore += 10;

  return {
    job_types: jobTypes.length > 0 ? jobTypes : ["unknown"],
    urgency_level: urgency,
    expected_job_value: null,
    lead_score: Math.min(leadScore, 100),
    missing_info: missingInfo,
    next_steps: nextSteps,
    full_analysis: {
      method: "fallback",
      text,
    },
  };
}



















































