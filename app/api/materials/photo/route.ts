// Block 18300 — Material Detection Engine v1
// POST /api/materials/photo
// Detects roofing materials from photos using AI vision

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

interface PhotoDetectionResult {
  materialType: string | null;
  shingleType: string | null;
  metalType: string | null;
  tileType: string | null;
  flatType: string | null;
  shinglePattern: string | null;
  metalSeamSpacing: string | null;
  tileShape: string | null;
  membraneColor: string | null;
  pitchEstimate: string | null;
  penetrations: string[];
  conditions: {
    mossBuildup: boolean;
    granuleLoss: boolean;
    hailImpact: boolean;
    windUplift: boolean;
  };
  confidence: number;
  metadata: Record<string, any>;
}

async function detectFromPhotoWithAI(imageUrl: string): Promise<PhotoDetectionResult> {
  // Use OpenAI Vision API for photo analysis
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    // Fallback to basic detection if no API key
    return {
      materialType: null,
      shingleType: null,
      metalType: null,
      tileType: null,
      flatType: null,
      shinglePattern: null,
      metalSeamSpacing: null,
      tileShape: null,
      membraneColor: null,
      pitchEstimate: null,
      penetrations: [],
      conditions: {
        mossBuildup: false,
        granuleLoss: false,
        hailImpact: false,
        windUplift: false,
      },
      confidence: 0,
      metadata: { error: 'No OpenAI API key configured' },
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use vision-capable model
        messages: [
          {
            role: 'system',
            content: `You are a roofing material detection expert. Analyze roof photos and identify:
1. Material type (asphalt_shingle, metal, tile, flat_tpo, flat_epdm, flat_mod_bit, slate, wood_shake, unknown)
2. If asphalt: shingle type (3_tab, architectural, premium, impact_resistant)
3. If metal: metal type (standing_seam, corrugated, ribbed_panel)
4. If tile: tile type (clay, concrete, slate_look)
5. If flat: flat type (tpo, epdm, modified_bitumen)
6. Pitch estimate (low_slope, medium_slope, steep_slope, unknown)
7. Components visible (skylight, chimney, vent, pipe, satellite)
8. Conditions (moss_buildup, granule_loss, hail_impact, wind_uplift)
9. Shingle pattern description (if applicable)
10. Metal seam spacing (if applicable)
11. Tile shape (if applicable)
12. Membrane color (if applicable)

Return JSON only with this structure:
{
  "materialType": "asphalt_shingle",
  "shingleType": "architectural",
  "pitchEstimate": "medium_slope",
  "penetrations": ["skylight", "vent"],
  "conditions": {
    "mossBuildup": false,
    "granuleLoss": true,
    "hailImpact": false,
    "windUplift": false
  },
  "shinglePattern": "Dimensional shingle pattern visible",
  "confidence": 85
}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this roof photo and identify the material type, characteristics, and conditions.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0]?.message?.content || '{}');

    return {
      materialType: content.materialType || null,
      shingleType: content.shingleType || null,
      metalType: content.metalType || null,
      tileType: content.tileType || null,
      flatType: content.flatType || null,
      shinglePattern: content.shinglePattern || null,
      metalSeamSpacing: content.metalSeamSpacing || null,
      tileShape: content.tileShape || null,
      membraneColor: content.membraneColor || null,
      pitchEstimate: content.pitchEstimate || null,
      penetrations: content.penetrations || [],
      conditions: {
        mossBuildup: content.conditions?.mossBuildup || false,
        granuleLoss: content.conditions?.granuleLoss || false,
        hailImpact: content.conditions?.hailImpact || false,
        windUplift: content.conditions?.windUplift || false,
      },
      confidence: content.confidence || 0,
      metadata: {
        model: 'gpt-4o',
        analysisMethod: 'openai_vision',
      },
    };
  } catch (error: any) {
    console.error('Error calling OpenAI Vision API:', error);
    return {
      materialType: null,
      shingleType: null,
      metalType: null,
      tileType: null,
      flatType: null,
      shinglePattern: null,
      metalSeamSpacing: null,
      tileShape: null,
      membraneColor: null,
      pitchEstimate: null,
      penetrations: [],
      conditions: {
        mossBuildup: false,
        granuleLoss: false,
        hailImpact: false,
        windUplift: false,
      },
      confidence: 0,
      metadata: { error: error.message },
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contactId, attachmentId, imageUrl } = body;

    if (!contactId || (!attachmentId && !imageUrl)) {
      return NextResponse.json(
        { error: "contactId and either attachmentId or imageUrl are required" },
        { status: 400 }
      );
    }

    // Get contact and workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get image URL
    let finalImageUrl = imageUrl;
    if (attachmentId && !imageUrl) {
      const { data: attachment, error: attachError } = await supabase
        .from("attachments")
        .select("storage_path, file_type")
        .eq("id", attachmentId)
        .single();

      if (attachError || !attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }

      if (!attachment.file_type.startsWith("image/")) {
        return NextResponse.json({ error: "File is not an image" }, { status: 400 });
      }

      const { data: urlData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, 3600);

      if (!urlData?.signedUrl) {
        return NextResponse.json({ error: "Failed to generate image URL" }, { status: 500 });
      }

      finalImageUrl = urlData.signedUrl;
    }

    // Detect materials from photo
    const detection = await detectFromPhotoWithAI(finalImageUrl);

    // Get existing intelligence or create new
    const { data: existingIntel } = await supabase
      .from("material_intelligence")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    // Merge photo detection with existing text detection
    const mergedData: any = {
      contact_id: contactId,
      workspace_id: contact.workspace_id,
      detected_from_photo: true,
      photo_confidence: detection.confidence,
      last_analyzed_at: new Date().toISOString(),
    };

    // Update material type if detected from photo (or keep existing if higher confidence)
    if (detection.materialType && (!existingIntel?.material_type || detection.confidence > (existingIntel?.photo_confidence || 0))) {
      mergedData.material_type = detection.materialType;
      mergedData.shingle_type = detection.shingleType;
      mergedData.metal_type = detection.metalType;
      mergedData.tile_type = detection.tileType;
      mergedData.flat_type = detection.flatType;
    }

    // Update pitch if detected
    if (detection.pitchEstimate) {
      mergedData.pitch_estimate = detection.pitchEstimate;
    }

    // Update components
    if (detection.penetrations.length > 0) {
      mergedData.has_skylights = detection.penetrations.includes('skylight') || existingIntel?.has_skylights;
      mergedData.has_chimney = detection.penetrations.includes('chimney') || existingIntel?.has_chimney;
      mergedData.has_box_vents = detection.penetrations.includes('vent') || existingIntel?.has_box_vents;
      mergedData.has_pipe_boots = detection.penetrations.includes('pipe') || existingIntel?.has_pipe_boots;
      mergedData.has_satellite_mounts = detection.penetrations.includes('satellite') || existingIntel?.has_satellite_mounts;
    }

    // Update conditions
    mergedData.moss_buildup_detected = detection.conditions.mossBuildup || existingIntel?.moss_buildup_detected;
    mergedData.granule_loss_detected = detection.conditions.granuleLoss || existingIntel?.granule_loss_detected;
    mergedData.hail_impact_marks = detection.conditions.hailImpact || existingIntel?.hail_impact_marks;
    mergedData.wind_uplift_detected = detection.conditions.windUplift || existingIntel?.wind_uplift_detected;

    // Merge metadata
    const existingMetadata = existingIntel?.detection_metadata || {};
    mergedData.detection_metadata = {
      ...existingMetadata,
      photoAnalysis: {
        ...detection.metadata,
        shinglePattern: detection.shinglePattern,
        metalSeamSpacing: detection.metalSeamSpacing,
        tileShape: detection.tileShape,
        membraneColor: detection.membraneColor,
      },
    };

    // Upsert material intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("material_intelligence")
      .upsert(mergedData, {
        onConflict: 'contact_id',
      })
      .select()
      .single();

    if (intelError) {
      console.error("Error saving material intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to save detection" },
        { status: 500 }
      );
    }

    // Create material_photos record
    if (attachmentId) {
      await supabase
        .from("material_photos")
        .insert({
          contact_id: contactId,
          workspace_id: contact.workspace_id,
          attachment_id: attachmentId,
          detected_material_type: detection.materialType,
          detected_shingle_pattern: detection.shinglePattern,
          detected_metal_seam_spacing: detection.metalSeamSpacing,
          detected_tile_shape: detection.tileShape,
          detected_membrane_color: detection.membraneColor,
          penetrations_detected: detection.penetrations,
          moss_buildup_detected: detection.conditions.mossBuildup,
          granule_loss_detected: detection.conditions.granuleLoss,
          hail_impact_marks: detection.conditions.hailImpact,
          wind_uplift_detected: detection.conditions.windUplift,
          photo_analysis_metadata: detection.metadata,
          analyzed_at: new Date().toISOString(),
        });
    }

    // Calculate scores
    await supabase.rpc('calculate_material_scores', {
      p_contact_id: contactId,
    });

    return NextResponse.json({
      success: true,
      detection,
      intelligence,
    });
  } catch (error: any) {
    console.error("Error detecting materials from photo:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































