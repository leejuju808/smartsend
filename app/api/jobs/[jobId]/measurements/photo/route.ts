// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: Photo-Based Measurement (Upload 3-6 images)
// POST /api/jobs/[jobId]/measurements/photo

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Analyze roof photos with OpenAI Vision API
 */
async function analyzeRoofPhotosWithAI(imageUrls: string[]): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `You are a professional roofing measurement AI expert. Analyze these roof photos (multiple angles: front, sides, rear, up-close slope, optional drone) and provide accurate measurements.

From these images, estimate:
- Pitch (most accurate from photos with clear slope view)
- Facet count (number of roof planes)
- Measured linear components (eaves, ridges, valleys, hips)
- Squares estimate using image perspective and context clues

Return ONLY valid JSON in this exact format:
{
  "squares": 28.5,
  "pitch": "7/12",
  "facets": 6,
  "ridges_length": 42,
  "eaves_length": 110,
  "hips_length": 24,
  "valleys_length": 18,
  "confidence": 0.90
}`;

  // Prepare image messages
  const imageMessages = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze these ${imageUrls.length} roof photos from different angles. Estimate: Pitch (most accurate), Facet count, Linear components (eaves, ridges, valleys, hips), Squares estimate. Output JSON only.`,
            },
            ...imageMessages,
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  const content = JSON.parse(data.choices[0]?.message?.content || "{}");

  return content;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { imageUrls } = body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: "imageUrls array is required (3-6 images recommended)" },
        { status: 400 }
      );
    }

    if (imageUrls.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 images allowed" },
        { status: 400 }
      );
    }

    // Verify job exists
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .select("id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Analyze photos with AI
    const aiResult = await analyzeRoofPhotosWithAI(imageUrls);

    // Calculate waste factor based on complexity
    let wasteFactor = 0.10; // Default 10%
    if (aiResult.facets && aiResult.facets > 4) {
      wasteFactor = 0.12; // 12% for complex roofs
    }
    if (aiResult.valleys_length && aiResult.valleys_length > 50) {
      wasteFactor = Math.max(wasteFactor, 0.12); // More waste for many valleys
    }

    // Save measurement to database
    const { data: measurement, error: insertError } = await serviceSupabase
      .from("roof_measurements")
      .insert({
        job_id: jobId,
        method: "photo",
        squares: aiResult.squares,
        ridges_length: aiResult.ridges_length || 0,
        eaves_length: aiResult.eaves_length || 0,
        hips_length: aiResult.hips_length || 0,
        valleys_length: aiResult.valleys_length || 0,
        pitch: aiResult.pitch,
        facets: aiResult.facets || 1,
        confidence: aiResult.confidence || 0.5,
        waste_factor: wasteFactor,
        raw_output: aiResult,
        image_urls: imageUrls,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error saving measurement:", insertError);
      return NextResponse.json(
        { error: "Failed to save measurement", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      measurement,
      message: "Photo-based measurement completed successfully",
    });
  } catch (error: any) {
    console.error("Error in photo measurement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























