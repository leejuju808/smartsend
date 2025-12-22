// Edge Function: AI-powered job duration estimation
// POST /functions/v1/schedule-ai-duration

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface DurationRequest {
  job_id: string;
  crew_id?: string;
  roof_squares?: number;
  roof_pitch?: number;
  layers?: number; // 1, 2, or 3
  material_type?: string; // shingle, metal, tile, etc.
  crew_size?: number;
  complexity_factors?: string[]; // skylights, chimneys, valleys, etc.
}

Deno.serve(async (req) => {
  try {
    const body: DurationRequest = await req.json();

    if (!body.job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, official_squares, roof_squares, roof_pitch, skylights_count, chimneys_count, valleys_count, complexity_factor")
      .eq("id", body.job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get crew details if provided
    let crew_capacity = 20; // default squares per day
    if (body.crew_id) {
      const { data: crew } = await supabase
        .from("crews")
        .select("daily_capacity_squares")
        .eq("id", body.crew_id)
        .single();

      if (crew?.daily_capacity_squares) {
        crew_capacity = crew.daily_capacity_squares;
      }
    }

    // Extract job parameters
    const squares = body.roof_squares || job.official_squares || job.roof_squares || 0;
    const pitch = body.roof_pitch || job.roof_pitch || 0;
    const complexity = job.complexity_factor || 1.0;
    const skylights = job.skylights_count || 0;
    const chimneys = job.chimneys_count || 0;
    const valleys = job.valleys_count || 0;

    // If OpenAI is available, use AI for more accurate estimation
    if (OPENAI_API_KEY) {
      const prompt = `Estimate the duration (in hours) for a roofing job with these parameters:
- Roof size: ${squares} squares
- Pitch: ${pitch}/12
- Complexity factor: ${complexity}
- Skylights: ${skylights}
- Chimneys: ${chimneys}
- Valleys: ${valleys}
- Crew daily capacity: ${crew_capacity} squares/day
- Material type: ${body.material_type || "shingle"}
- Layers: ${body.layers || 1}

Consider:
- Standard workday is 8 hours
- Pitch affects difficulty (higher pitch = more time)
- Complexity features add time
- Multiple layers require tear-off time
- Weather delays are NOT included

Return ONLY a JSON object with:
{
  "estimated_hours": <number>,
  "estimated_days": <number>,
  "breakdown": {
    "base_hours": <number>,
    "pitch_multiplier": <number>,
    "complexity_hours": <number>,
    "features_hours": <number>
  },
  "confidence": "high" | "medium" | "low"
}`;

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "You are a roofing operations expert. Estimate job duration based on job parameters. Return only valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        const aiData = await response.json();
        const content = aiData.choices[0]?.message?.content;

        if (content) {
          try {
            const aiResult = JSON.parse(content);
            return new Response(
              JSON.stringify({
                success: true,
                estimated_hours: aiResult.estimated_hours,
                estimated_days: aiResult.estimated_days || Math.ceil(aiResult.estimated_hours / 8),
                breakdown: aiResult.breakdown,
                confidence: aiResult.confidence || "medium",
                method: "ai",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          } catch (parseError) {
            // Fall through to formula-based calculation
          }
        }
      } catch (aiError) {
        console.error("AI estimation failed, using formula:", aiError);
        // Fall through to formula-based calculation
      }
    }

    // Formula-based calculation (fallback or if no OpenAI)
    const base_hours = (squares / crew_capacity) * 8;
    const pitch_multiplier = 1 + (pitch / 12) * 0.15; // 15% per pitch unit
    const complexity_hours = (complexity - 1.0) * base_hours * 0.2;
    const features_hours = (skylights * 0.5) + (chimneys * 0.3) + (valleys * 0.2);
    
    const estimated_hours = (base_hours * pitch_multiplier) + complexity_hours + features_hours;
    const estimated_days = Math.ceil(estimated_hours / 8);

    return new Response(
      JSON.stringify({
        success: true,
        estimated_hours: Math.round(estimated_hours * 10) / 10,
        estimated_days: estimated_days,
        breakdown: {
          base_hours: Math.round(base_hours * 10) / 10,
          pitch_multiplier: Math.round(pitch_multiplier * 100) / 100,
          complexity_hours: Math.round(complexity_hours * 10) / 10,
          features_hours: Math.round(features_hours * 10) / 10,
        },
        confidence: "medium",
        method: "formula",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error calculating duration:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































