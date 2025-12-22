// Block 18500 — SmartSend Photo Intelligence v1
// GET /api/photo/contact/{id}
// Get comprehensive photo intelligence summary for a contact

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contactId = params.id;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

    // Get contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get all photo intelligence for this contact
    const { data: photoIntelligence, error: intelError } = await supabase
      .from("photo_intelligence")
      .select("*")
      .eq("contact_id", contactId)
      .order("analyzed_at", { ascending: false });

    if (intelError) {
      console.error("Error fetching photo intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to fetch photo intelligence" },
        { status: 500 }
      );
    }

    // Get aggregated photo damage scores
    const { data: damageScores, error: scoresError } = await supabase
      .from("photo_damage_scores")
      .select("*")
      .eq("contact_id", contactId)
      .maybeSingle();

    if (scoresError) {
      console.error("Error fetching damage scores:", scoresError);
    }

    // Get photo material tags
    const { data: materialTags, error: tagsError } = await supabase
      .from("photo_material_tags")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });

    if (tagsError) {
      console.error("Error fetching material tags:", tagsError);
    }

    // Get photo events
    const { data: events, error: eventsError } = await supabase
      .from("photo_events")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (eventsError) {
      console.error("Error fetching photo events:", eventsError);
    }

    // Build summary
    const summary = {
      contactId,
      workspaceId: contact.workspace_id,
      photosAnalyzed: photoIntelligence?.length || 0,
      damageScores: damageScores || null,
      detectedDamageTypes: extractDamageTypes(photoIntelligence || []),
      materialType: extractMaterialType(photoIntelligence || []),
      pitchGuess: extractPitchGuess(photoIntelligence || []),
      severityScore: damageScores?.overall_severity_score || 0,
      severityCategory: getSeverityCategory(damageScores?.overall_severity_score || 0),
      insuranceProbability: damageScores?.insurance_probability_score || 0,
      insuranceLikelihood: getInsuranceLikelihood(damageScores?.insurance_probability_score || 0),
      repairUrgency: damageScores?.repair_urgency_score || 0,
      urgencyLevel: getUrgencyLevel(damageScores?.repair_urgency_score || 0),
      recommendedAction: damageScores?.recommended_action || null,
      replacementRecommendation: damageScores?.replacement_recommendation || null,
      recommendedAppointmentSlot: damageScores?.recommended_appointment_slot || null,
      materialTags: materialTags || [],
      recentEvents: events || [],
      photoIntelligence: photoIntelligence || [],
    };

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error: any) {
    console.error("Error fetching contact photo summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function extractDamageTypes(photos: any[]): string[] {
  const types: Set<string> = new Set();
  
  for (const photo of photos) {
    if (photo.storm_damage_detected) types.add('Storm Damage');
    if (photo.leak_detected) types.add('Leak');
    if (photo.water_intrusion_detected) types.add('Water Intrusion');
    if (photo.gutter_damage_detected) types.add('Gutter Damage');
    if (photo.interior_damage_detected) types.add('Interior Damage');
    if (photo.hail_marks_detected) types.add('Hail Damage');
    if (photo.wind_torn_shingles) types.add('Wind Damage');
  }
  
  return Array.from(types);
}

function extractMaterialType(photos: any[]): string | null {
  for (const photo of photos) {
    if (photo.material_type) {
      return photo.material_type;
    }
  }
  return null;
}

function extractPitchGuess(photos: any[]): string | null {
  // This would come from material_intelligence if available
  // For now, return null
  return null;
}

function getSeverityCategory(score: number): string {
  if (score >= 80) return 'Major Damage';
  if (score >= 60) return 'Moderate Damage';
  if (score >= 40) return 'Minor Damage';
  return 'Cosmetic / Uncertain';
}

function getInsuranceLikelihood(score: number): 'High' | 'Medium' | 'Low' | 'Unknown' {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  if (score > 0) return 'Low';
  return 'Unknown';
}

function getUrgencyLevel(score: number): 'Critical' | 'High' | 'Medium' | 'Low' {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}





















































