// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Process Roof Scan
// POST /api/fieldvision/process

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Analyze roof images with AI for measurements and damage detection
 */
async function analyzeRoofScanWithAI(imageUrls: string[]): Promise<any> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = `You are a professional roofing AI expert specializing in drone photo analysis, roof measurements, and damage detection.

Analyze these roof images and provide:
1. ROOF MEASUREMENTS:
   - Total area in square feet
   - Total squares (area / 100)
   - Pitch (e.g., "4:12", "6:12", "steep")
   - Facet count and area per facet
   - Ridge, hip, valley, rake lengths in linear feet
   - Perimeter in feet
   - Recommended waste factor percentage

2. DAMAGE DETECTION:
   - Hail hits count
   - Wind damage (lifted/creased shingles) count
   - Missing shingles count
   - Soft spots (decking issues) count
   - Nail pops count
   - Pipe boot cracks count
   - Flashing deterioration count
   - Granule loss severity (none, light, moderate, severe)
   - Overall damage severity score (0-100)
   - Repair required (boolean)
   - Replacement recommended (boolean)

3. FEATURES DETECTED:
   - Chimneys, skylights, vents, dormers, etc.

Return ONLY valid JSON in this exact format:
{
  "measurements": {
    "total_area": 2850,
    "total_squares": 28.5,
    "pitch": "6:12",
    "pitch_degrees": 26.57,
    "facets": [
      {"id": 1, "area_sqft": 1200, "pitch": "6:12"},
      {"id": 2, "area_sqft": 800, "pitch": "4:12"}
    ],
    "edges": {
      "ridge_lf": 42,
      "hip_lf": 24,
      "valley_lf": 18,
      "rake_lf": 110
    },
    "perimeter": 180,
    "waste_factor": 12.0
  },
  "damage": {
    "hail_hits": 15,
    "wind_damage": 8,
    "missing_shingles": 3,
    "soft_spots": 0,
    "nail_pops": 5,
    "pipe_boot_cracks": 1,
    "flashing_deterioration": 2,
    "granule_loss_severity": "moderate",
    "damage_severity_score": 45,
    "repair_required": true,
    "replacement_recommended": false
  },
  "features": ["chimney", "skylight", "ridge_vent"],
  "confidence": 0.92
}`;

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
              text: `Analyze these ${imageUrls.length} roof images (drone photos, top-down views, side elevations). Provide comprehensive measurements and damage detection. Output JSON only.`,
            },
            ...imageMessages,
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 2000,
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
    const { scanId } = body;

    if (!scanId) {
      return NextResponse.json(
        { error: "scanId is required" },
        { status: 400 }
      );
    }

    // Get scan
    const { data: scan, error: scanError } = await serviceSupabase
      .from("roof_scans")
      .select("*")
      .eq("id", scanId)
      .single();

    if (scanError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Get all images for this scan
    const { data: images, error: imagesError } = await serviceSupabase
      .from("roof_images")
      .select("url")
      .eq("scan_id", scanId);

    if (imagesError || !images || images.length === 0) {
      return NextResponse.json(
        { error: "No images found for scan" },
        { status: 400 }
      );
    }

    const imageUrls = images.map((img) => img.url);

    // Update scan status to processing
    await serviceSupabase
      .from("roof_scans")
      .update({ status: "processing" })
      .eq("id", scanId);

    // Analyze with AI
    const aiResult = await analyzeRoofScanWithAI(imageUrls);

    // Update scan with measurements
    const { data: updatedScan, error: updateError } = await serviceSupabase
      .from("roof_scans")
      .update({
        total_area: aiResult.measurements?.total_area,
        total_squares: aiResult.measurements?.total_squares,
        pitch: aiResult.measurements?.pitch,
        pitch_degrees: aiResult.measurements?.pitch_degrees,
        facets: aiResult.measurements?.facets || [],
        edges: aiResult.measurements?.edges || {},
        perimeter: aiResult.measurements?.perimeter,
        waste_factor: aiResult.measurements?.waste_factor || 12.0,
        processing_metadata: {
          confidence: aiResult.confidence,
          model: "gpt-4o",
          processed_at: new Date().toISOString(),
        },
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating scan:", updateError);
      return NextResponse.json(
        { error: "Failed to update scan", details: updateError.message },
        { status: 500 }
      );
    }

    // Create or update damage report
    if (aiResult.damage) {
      const { error: damageError } = await serviceSupabase
        .from("damage_reports")
        .upsert(
          {
            scan_id: scanId,
            hail_hits: aiResult.damage.hail_hits || 0,
            wind_damage: aiResult.damage.wind_damage || 0,
            missing_shingles: aiResult.damage.missing_shingles || 0,
            soft_spots: aiResult.damage.soft_spots || 0,
            nail_pops: aiResult.damage.nail_pops || 0,
            pipe_boot_cracks: aiResult.damage.pipe_boot_cracks || 0,
            flashing_deterioration: aiResult.damage.flashing_deterioration || 0,
            granule_loss_severity: aiResult.damage.granule_loss_severity || "none",
            damage_severity_score: aiResult.damage.damage_severity_score || 0,
            repair_required: aiResult.damage.repair_required || false,
            replacement_recommended: aiResult.damage.replacement_recommended || false,
            insurance_claim_supporting: (aiResult.damage.damage_severity_score || 0) > 30,
            ai_confidence: aiResult.confidence,
            processing_model: "gpt-4o",
          },
          {
            onConflict: "scan_id",
          }
        );

      if (damageError) {
        console.error("Error creating damage report:", damageError);
      }

      // Update images with damage flags
      if (aiResult.damage.damage_severity_score > 0) {
        await serviceSupabase
          .from("roof_images")
          .update({ damage_detected: true })
          .eq("scan_id", scanId);
      }
    }

    // Update images with AI tags
    if (aiResult.features && Array.isArray(aiResult.features)) {
      for (const image of images) {
        await serviceSupabase
          .from("roof_images")
          .update({
            ai_tags: aiResult.features,
          })
          .eq("id", image.id);
      }
    }

    // Auto-generate scope items (trigger will handle this, but we can call it explicitly)
    await serviceSupabase.rpc("generate_auto_scope_from_scan", {
      p_scan_id: scanId,
    });

    return NextResponse.json({
      success: true,
      scan: updatedScan,
      measurements: aiResult.measurements,
      damage: aiResult.damage,
      message: "Roof scan processed successfully",
    });
  } catch (error: any) {
    console.error("Error in fieldvision process:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























