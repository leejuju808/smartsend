// Block 18300 — Material Detection Engine v1
// GET /api/materials/[contactId]
// Get material intelligence summary for a contact

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: { contactId: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contactId = params.contactId;

    // Get material intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("material_intelligence")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (intelError) {
      console.error("Error fetching material intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to fetch material intelligence" },
        { status: 500 }
      );
    }

    // Get material tags
    const { data: tags, error: tagsError } = await supabase
      .from("material_tags")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    if (tagsError) {
      console.error("Error fetching material tags:", tagsError);
    }

    // Get material scores
    const { data: scores, error: scoresError } = await supabase
      .from("material_scores")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (scoresError) {
      console.error("Error fetching material scores:", scoresError);
    }

    // Get material photos
    const { data: photos, error: photosError } = await supabase
      .from("material_photos")
      .select(`
        *,
        attachments (
          id,
          file_name,
          file_type,
          storage_path,
          url
        )
      `)
      .eq("contact_id", contactId)
      .order("analyzed_at", { ascending: false });

    if (photosError) {
      console.error("Error fetching material photos:", photosError);
    }

    // Calculate compatibility flags and risk assessments if not already set
    let compatibilityFlags: string[] = [];
    let stormVulnerability = 'unknown';
    let insuranceAngle = 'unknown';
    let replacementUrgency = 'unknown';

    if (intelligence) {
      // Calculate compatibility flags
      if (intelligence.material_type === 'metal' && intelligence.pitch_estimate === 'low_slope') {
        compatibilityFlags.push('metal_low_pitch');
      }
      if (intelligence.material_type === 'tile') {
        compatibilityFlags.push('tile_weak_framing'); // General concern
      }
      if (intelligence.material_type === 'flat_tpo' && intelligence.detection_metadata?.location === 'cold_climate') {
        compatibilityFlags.push('tpo_cold_climate');
      }

      // Calculate storm vulnerability
      if (intelligence.hail_impact_marks || intelligence.wind_uplift_detected) {
        stormVulnerability = 'high';
      } else if (intelligence.granule_loss_detected || intelligence.shingle_curl_detected) {
        stormVulnerability = 'medium';
      } else {
        stormVulnerability = 'low';
      }

      // Calculate insurance angle
      if (intelligence.hail_impact_marks || intelligence.wind_uplift_detected) {
        insuranceAngle = 'strong';
      } else if (intelligence.roof_age_category === '16_25_years' || intelligence.roof_age_category === '25_plus_years') {
        insuranceAngle = 'moderate';
      } else {
        insuranceAngle = 'weak';
      }

      // Calculate replacement urgency
      if (intelligence.roof_age_category === '25_plus_years' || intelligence.granule_loss_detected || intelligence.shingle_curl_detected) {
        replacementUrgency = 'high';
      } else if (intelligence.roof_age_category === '16_25_years') {
        replacementUrgency = 'medium';
      } else if (intelligence.roof_age_category === '0_5_years' || intelligence.roof_age_category === '6_15_years') {
        replacementUrgency = 'low';
      }

      // Update intelligence with calculated values if they're not set
      if (!intelligence.compatibility_flags || intelligence.compatibility_flags.length === 0) {
        await supabase
          .from("material_intelligence")
          .update({
            compatibility_flags: compatibilityFlags,
            storm_vulnerability: stormVulnerability,
            insurance_angle: insuranceAngle,
            replacement_urgency: replacementUrgency,
          })
          .eq("contact_id", contactId);
      } else {
        compatibilityFlags = intelligence.compatibility_flags;
        stormVulnerability = intelligence.storm_vulnerability || stormVulnerability;
        insuranceAngle = intelligence.insurance_angle || insuranceAngle;
        replacementUrgency = intelligence.replacement_urgency || replacementUrgency;
      }
    }

    // Format material summary
    const summary = {
      materialType: intelligence?.material_type || 'unknown',
      materialDetails: {
        shingleType: intelligence?.shingle_type,
        metalType: intelligence?.metal_type,
        tileType: intelligence?.tile_type,
        flatType: intelligence?.flat_type,
      },
      pitch: intelligence?.pitch_estimate || 'unknown',
      layerCount: intelligence?.layer_count || 'uncertain',
      ageEstimate: intelligence?.roof_age_category || 'unknown',
      components: {
        skylights: intelligence?.has_skylights || false,
        chimney: intelligence?.has_chimney || false,
        boxVents: intelligence?.has_box_vents || false,
        ridgeVents: intelligence?.has_ridge_vents || false,
        pipeBoots: intelligence?.has_pipe_boots || false,
        satelliteMounts: intelligence?.has_satellite_mounts || false,
        solarPanels: intelligence?.has_solar_panels || false,
      },
      conditions: {
        granuleLoss: intelligence?.granule_loss_detected || false,
        shingleCurl: intelligence?.shingle_curl_detected || false,
        mossBuildup: intelligence?.moss_buildup_detected || false,
        hailImpact: intelligence?.hail_impact_marks || false,
        windUplift: intelligence?.wind_uplift_detected || false,
      },
      compatibilityFlags,
      stormVulnerability,
      insuranceAngle,
      replacementUrgency,
      confidence: {
        overall: intelligence?.overall_confidence || 0,
        text: intelligence?.text_confidence || 0,
        photo: intelligence?.photo_confidence || 0,
      },
      detectionSources: {
        fromText: intelligence?.detected_from_text || false,
        fromPhoto: intelligence?.detected_from_photo || false,
      },
      tags: tags || [],
      scores: scores || null,
      photos: photos || [],
      lastAnalyzed: intelligence?.last_analyzed_at || null,
    };

    return NextResponse.json({
      success: true,
      summary,
      intelligence,
    });
  } catch (error: any) {
    console.error("Error fetching material summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































