// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: Aerial Measurement (Satellite Imagery)
// POST /api/jobs/[jobId]/measurements/aerial

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Get satellite imagery from Google Maps Static API
 */
async function getSatelliteImage(address: string): Promise<string | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("Google Maps API key not configured");
    return null;
  }

  try {
    // Geocode address first to get coordinates
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status !== "OK" || !geocodeData.results?.[0]?.geometry?.location) {
      throw new Error("Failed to geocode address");
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Get satellite imagery (zoom level 20 for roof detail)
    const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;
    
    // Download image and convert to base64 or return URL
    // For OpenAI Vision, we can use the URL directly if it's publicly accessible
    // Otherwise, we'd need to download and convert to base64
    
    return satelliteUrl;
  } catch (error: any) {
    console.error("Error fetching satellite imagery:", error);
    return null;
  }
}

/**
 * Analyze roof with OpenAI Vision API
 */
async function analyzeRoofWithAI(imageUrl: string): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `You are a professional roofing measurement AI expert. Analyze this roof image (satellite/aerial view) and estimate:

- Total squares (1 square = 100 sq ft)
- Ridge length (linear feet)
- Eave length (linear feet along bottom edges)
- Hips (linear feet of hip lines)
- Valleys (linear feet of valley lines)
- Slope/pitch estimation (e.g., "7/12", "6/12", "4/12")
- Number of facets/planes

Be conservative with estimates. Return ONLY valid JSON in this exact format:
{
  "squares": 28.5,
  "ridges_length": 42,
  "eaves_length": 110,
  "hips_length": 24,
  "valleys_length": 18,
  "pitch": "7/12",
  "facets": 6,
  "confidence": 0.85
}`;

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
              text: "Analyze this roof image. Estimate: Total squares, Ridge length, Eave length, Hips, Valleys, Slope/pitch estimation, Number of facets. Output JSON only.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000,
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

    // Get job and address
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .select("id, address, lead_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get address from job or lead
    let address = job.address;
    if (!address && job.lead_id) {
      const { data: lead } = await serviceSupabase
        .from("leads")
        .select("address_line1, city, state, zip_code")
        .eq("id", job.lead_id)
        .single();
      
      if (lead) {
        address = [
          lead.address_line1,
          lead.city,
          lead.state,
          lead.zip_code,
        ]
          .filter(Boolean)
          .join(", ");
      }
    }

    if (!address) {
      return NextResponse.json(
        { error: "Job address not found" },
        { status: 400 }
      );
    }

    // Get satellite imagery
    const satelliteImageUrl = await getSatelliteImage(address);

    if (!satelliteImageUrl) {
      return NextResponse.json(
        { error: "Failed to fetch satellite imagery" },
        { status: 500 }
      );
    }

    // Analyze with AI
    const aiResult = await analyzeRoofWithAI(satelliteImageUrl);

    // Save measurement to database
    const { data: measurement, error: insertError } = await serviceSupabase
      .from("roof_measurements")
      .insert({
        job_id: jobId,
        method: "aerial",
        squares: aiResult.squares,
        ridges_length: aiResult.ridges_length || 0,
        eaves_length: aiResult.eaves_length || 0,
        hips_length: aiResult.hips_length || 0,
        valleys_length: aiResult.valleys_length || 0,
        pitch: aiResult.pitch,
        facets: aiResult.facets || 1,
        confidence: aiResult.confidence || 0.5,
        waste_factor: 0.10,
        raw_output: aiResult,
        image_urls: [satelliteImageUrl],
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
      message: "Aerial measurement completed successfully",
    });
  } catch (error: any) {
    console.error("Error in aerial measurement:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























