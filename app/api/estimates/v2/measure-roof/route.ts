// Block 255900 — SmartSend AI Estimating Engine v2
// Full Roof Measurement AI (Address, Drone, Manual Upload)
// POST /api/estimates/v2/measure-roof

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Address-only measurement using satellite imagery
 */
async function measureFromAddress(address: string): Promise<any> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key not configured");
  }

  // Geocode address
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const geocodeResponse = await fetch(geocodeUrl);
  const geocodeData = await geocodeResponse.json();

  if (geocodeData.status !== "OK" || !geocodeData.results?.[0]?.geometry?.location) {
    throw new Error("Failed to geocode address");
  }

  const { lat, lng } = geocodeData.results[0].geometry.location;

  // Get satellite imagery
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=640x640&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;

  // Analyze with OpenAI Vision
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `You are a professional roofing measurement AI expert. Analyze this satellite roof image and provide accurate measurements.

Extract:
- Roof Area (squares - 1 square = 100 sq ft)
- Pitch (e.g., "6/12", "8/12")
- Facets (number of roof planes)
- Ridge length (linear feet)
- Hip length (linear feet)
- Valley length (linear feet)
- Eaves/Drip Edge length (linear feet)
- Perimeter (linear feet)
- Penetrations (chimneys, vents, skylights count)

Return ONLY valid JSON in this exact format:
{
  "squares": 28.47,
  "pitch": 6.0,
  "facets": 6,
  "ridge_length_ft": 41,
  "hip_length_ft": 29,
  "valley_length_ft": 14,
  "eaves_length_ft": 168,
  "perimeter_ft": 168,
  "penetrations": 3,
  "confidence": 0.85
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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
              type: "image_url",
              image_url: { url: satelliteUrl },
            },
            {
              type: "text",
              text: "Analyze this roof and provide measurements.",
            },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Failed to get AI response");
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Drone/manual photo measurement
 */
async function measureFromPhotos(imageUrls: string[]): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `You are a professional roofing measurement AI expert. Analyze these roof photos (drone or manual upload) and provide accurate measurements.

From these images, extract:
- Roof Area (squares)
- Pitch (most accurate from photos with clear slope view)
- Facet count (number of roof planes)
- Measured linear components (eaves, ridges, valleys, hips)
- Decking condition (rot, damage)
- Ventilation problems
- Hail damage
- Complexity score (1-10)

Return ONLY valid JSON in this exact format:
{
  "squares": 28.5,
  "pitch": 7.0,
  "facets": 6,
  "ridge_length_ft": 42,
  "eaves_length_ft": 110,
  "hips_length_ft": 24,
  "valleys_length_ft": 18,
  "decking_rot": false,
  "ventilation_issues": false,
  "hail_damage": false,
  "complexity_score": 6,
  "confidence": 0.90
}`;

  const imageMessages = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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
            ...imageMessages,
            {
              type: "text",
              text: "Analyze these roof photos and provide measurements.",
            },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Failed to get AI response");
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI response");
  }

  return JSON.parse(jsonMatch[0]);
}

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const { estimate_id, input_type, address, image_urls, job_id } = body;

    if (!estimate_id || !input_type) {
      return NextResponse.json(
        { error: "estimate_id and input_type are required" },
        { status: 400 }
      );
    }

    // Verify estimate exists
    const { data: estimate, error: estimateError } = await serviceSupabase
      .from("estimates")
      .select("id, org_id")
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    let measurementResult: any;
    let rawData: any = {};

    // Process based on input type
    if (input_type === "address_lookup") {
      if (!address) {
        return NextResponse.json(
          { error: "address is required for address_lookup" },
          { status: 400 }
        );
      }

      rawData = { address };
      measurementResult = await measureFromAddress(address);
    } else if (input_type === "drone" || input_type === "manual_upload") {
      if (!image_urls || !Array.isArray(image_urls) || image_urls.length === 0) {
        return NextResponse.json(
          { error: "image_urls array is required for drone/manual_upload" },
          { status: 400 }
        );
      }

      rawData = { image_urls };
      measurementResult = await measureFromPhotos(image_urls);
    } else {
      return NextResponse.json(
        { error: "Invalid input_type. Must be address_lookup, drone, or manual_upload" },
        { status: 400 }
      );
    }

    // Save measurement input
    const { data: measurementInput, error: inputError } = await serviceSupabase
      .from("measurement_inputs")
      .insert({
        estimate_id,
        job_id: job_id || null,
        input_type,
        raw_data: rawData,
        processed: true,
        processed_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (inputError) {
      console.error("Error saving measurement input:", inputError);
    }

    // Update estimate with measurement
    const { error: updateError } = await serviceSupabase
      .from("estimates")
      .update({
        measurement: measurementResult,
      })
      .eq("id", estimate_id);

    if (updateError) {
      console.error("Error updating estimate:", updateError);
    }

    return NextResponse.json({
      success: true,
      measurement: measurementResult,
      measurement_input_id: measurementInput?.id,
    });
  } catch (error: any) {
    console.error("Error in measure-roof:", error);
    return NextResponse.json(
      { error: error.message || "Failed to measure roof" },
      { status: 500 }
    );
  }
}





















