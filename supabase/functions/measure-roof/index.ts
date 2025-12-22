// Block 41200 — SmartSend Roofing "AI Roof Measurement + Diagram Engine" v1
// Edge Function: AI Roof Measurement from Photos
// POST /functions/v1/measure-roof

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a professional roofing measurement AI expert. Analyze roof photos and estimate measurements.

Your task is to analyze roof images and provide accurate estimates for:
- squares (1 square = 100 sq ft)
- pitch (e.g., "4/12", "6/12", "8/12", "10/12", "12/12")
- eaves_length (linear feet along the bottom edge)
- rakes_length (linear feet along the side edges)
- hips_length (linear feet of hip lines)
- valleys_length (linear feet of valley lines)
- ridge_length (linear feet of ridge lines)
- penetrations (array of objects with type: "chimney"|"skylight"|"vent", count: number)
- confidence (0-1 score based on photo quality and coverage)

Return ONLY valid JSON in this exact format:
{
  "squares": 25.5,
  "pitch": "6/12",
  "eaves_length": 120,
  "rakes_length": 80,
  "hips_length": 45,
  "valleys_length": 30,
  "ridge_length": 60,
  "penetrations": [{"type": "chimney", "count": 1}, {"type": "skylight", "count": 2}],
  "confidence": 0.85
}

Be conservative with estimates. If photos are unclear or incomplete, lower the confidence score.`;

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

    const { job_id, photos } = await req.json();

    if (!job_id || !photos || !Array.isArray(photos) || photos.length === 0) {
      return new Response(
        JSON.stringify({ error: "job_id and photos array are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare images for OpenAI Vision API
    const imageMessages = photos.map((photoUrl: string) => ({
      type: "image_url" as const,
      image_url: { url: photoUrl },
    }));

    // Call OpenAI Vision API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze these roof photos and provide measurements in the exact JSON format specified. Include all required fields.",
              },
              ...imageMessages,
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3, // Lower temperature for more consistent measurements
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze photos", details: errorText }),
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
    let measurements;
    try {
      measurements = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const requiredFields = ["squares", "pitch", "confidence"];
    for (const field of requiredFields) {
      if (measurements[field] === undefined || measurements[field] === null) {
        return new Response(
          JSON.stringify({ error: `Missing required field: ${field}` }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Ensure default values for optional fields
    measurements.eaves_length = measurements.eaves_length || 0;
    measurements.rakes_length = measurements.rakes_length || 0;
    measurements.hips_length = measurements.hips_length || 0;
    measurements.valleys_length = measurements.valleys_length || 0;
    measurements.ridge_length = measurements.ridge_length || 0;
    measurements.penetrations = measurements.penetrations || [];
    measurements.waste_factor = 0.1; // Default 10% waste

    // Insert measurement into database
    const { data: measurement, error: insertError } = await supabase
      .from("roof_measurements")
      .insert({
        job_id,
        squares: measurements.squares,
        waste_factor: measurements.waste_factor,
        pitch: measurements.pitch,
        eaves_length: measurements.eaves_length,
        rakes_length: measurements.rakes_length,
        hips_length: measurements.hips_length,
        valleys_length: measurements.valleys_length,
        ridge_length: measurements.ridge_length,
        penetrations: measurements.penetrations,
        confidence: measurements.confidence,
        raw_output: measurements,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save measurement", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Auto-calculate material estimates
    const { error: materialError } = await supabase.rpc("calculate_roof_materials", {
      p_measurement_id: measurement.id,
    });

    if (materialError) {
      console.error("Material calculation error:", materialError);
      // Don't fail the request, just log it
    }

    return new Response(
      JSON.stringify({
        ok: true,
        measurement,
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
    console.error("Error in measure-roof function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
































