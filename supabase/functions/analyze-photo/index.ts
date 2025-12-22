// Block 253400 — SmartSend Jobsite AI Camera Engine v1
// Edge Function: AI Photo Analysis for Jobsite Photos
// POST /functions/v1/analyze-photo
// Analyzes jobsite photos using OpenAI Vision to detect category, stage, QC issues, safety violations, etc.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are SmartSend Jobsite AI Camera Engine v1 - an elite AI roofing photo analyzer for jobsite operations.

Analyze this jobsite photo and extract EVERY critical detail:

1. PHOTO CATEGORY:
   - Category: 'roof_surface', 'materials', 'safety', 'flashing', 'ventilation', 'structural_issue', 'material_delivery', 'qc_check', 'damage', 'before', 'after'
   - Labels: Array of specific items detected (e.g., ['shingles', 'underlayment', 'ridge_vent', 'ladder', 'harness_missing'])

2. INSTALLATION STAGE DETECTION:
   - Detected Stage: 'tear_off', 'decking', 'underlayment', 'install', 'completed', 'material_delivery', 'before', 'after', or null
   - Look for visual indicators:
     * Tear-off: Old shingles being removed, exposed decking
     * Decking: Bare wood decking visible, repairs in progress
     * Underlayment: Underlayment material visible, no shingles yet
     * Install: Shingles being installed, partial installation
     * Completed: Finished roof with all shingles installed

3. TIME OF DAY:
   - Detect: 'morning', 'afternoon', 'evening' based on lighting, shadows, sun position

4. QC WORKMANSHIP CHECK (Score 0-100):
   Check for:
   - Straight shingle lines (crooked = deduction)
   - Nail line accuracy (exposed nails = deduction)
   - Proper flashing installation
   - Ridge alignment
   - Tar line presence (if applicable)
   - Wrinkles in underlayment
   - Lifted shingles
   - Debris on roof
   - Improper step flashing
   - Shingle alignment issues
   
   QC Score thresholds:
   - 90-100: Excellent (no issues detected)
   - 75-89: Good (minor issues)
   - 60-74: Needs correction (moderate issues)
   - <60: Warning (major issues, review required)

5. WORKMANSHIP ISSUES:
   - Array of specific issues: ['exposed_nails', 'lifted_shingle', 'crooked_line', 'improper_flashing', 'ridge_misalignment', 'missing_tar_lines', 'underlayment_wrinkles', 'debris_on_roof', 'improper_step_flashing']

6. SAFETY VIOLATION DETECTION:
   - Safety Flags: Array of violations detected:
     * 'no_harness' - Worker without fall protection harness
     * 'unsafe_ladder_angle' - Ladder at unsafe angle
     * 'no_safety_vest' - Worker without high-visibility vest
     * 'worker_too_close_to_edge' - Worker too close to roof edge
     * 'improper_anchor_point' - Improper safety anchor
     * 'material_blocking_ladder' - Materials blocking ladder base
     * 'missing_guardrail' - Missing guardrail/fall protection
   - If no violations, use empty array

7. MATERIAL PROBLEMS:
   - Material Problems: Array of issues: ['wrong_material', 'damaged_material', 'insufficient_material', 'material_misplacement']

8. CONFIDENCE SCORE:
   - Confidence: 0-100 based on image clarity and detection certainty

Return ONLY valid JSON in this exact format:
{
  "category": "roof_surface",
  "labels": ["shingles", "underlayment", "ridge_vent"],
  "confidence": 92,
  "detected_stage": "install",
  "time_of_day": "afternoon",
  "qc_score": 84,
  "workmanship_issues": ["exposed_nails"],
  "safety_flags": [],
  "material_problems": [],
  "analysis_notes": "Shingles being installed, minor exposed nail visible"
}

Be thorough, accurate, and conservative with safety flags. Only flag clear violations.`;

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { photo_id, photo_url } = await req.json();

    if (!photo_id || !photo_url) {
      return new Response(
        JSON.stringify({ error: "photo_id and photo_url are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify photo exists
    const { data: photo, error: photoError } = await supabase
      .from("job_photo_entries")
      .select("id, job_id, url")
      .eq("id", photo_id)
      .single();

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: "Photo not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call OpenAI Vision API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this jobsite roofing photo. Detect category, installation stage, QC workmanship issues, safety violations, and material problems. Be thorough and accurate.",
              },
              {
                type: "image_url",
                image_url: { url: photo_url, detail: "high" },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze photo", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Update photo entry with AI analysis
    const { data: updatedPhoto, error: updateError } = await supabase
      .from("job_photo_entries")
      .update({
        ai_category: analysis.category || null,
        ai_labels: analysis.labels || [],
        ai_confidence: analysis.confidence || null,
        ai_detected_stage: analysis.detected_stage || null,
        ai_safety_flags: analysis.safety_flags || [],
        ai_qc_score: analysis.qc_score || null,
        ai_time_of_day: analysis.time_of_day || null,
        ai_workmanship_issues: analysis.workmanship_issues || [],
        ai_material_problems: analysis.material_problems || [],
        ai_analysis_raw: analysis,
        ai_analyzed_at: new Date().toISOString(),
      })
      .eq("id", photo_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating photo with AI analysis:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save analysis", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Trigger will automatically:
    // 1. Update production milestones if stage detected
    // 2. Create safety violation alerts if safety flags detected

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          category: analysis.category,
          labels: analysis.labels || [],
          confidence: analysis.confidence,
          detected_stage: analysis.detected_stage,
          time_of_day: analysis.time_of_day,
          qc_score: analysis.qc_score,
          workmanship_issues: analysis.workmanship_issues || [],
          safety_flags: analysis.safety_flags || [],
          material_problems: analysis.material_problems || [],
        },
        photo: updatedPhoto,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in analyze-photo:", error);
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
});
























