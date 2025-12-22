import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/repair/contact/{id}
 * Get repair intelligence for a specific contact
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const contactId = params.id;

    if (!contactId) {
      return NextResponse.json(
        { error: "Contact ID is required" },
        { status: 400 }
      );
    }

    // Get contact to verify workspace access
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, repair_opportunity_detected, repair_score, repair_urgency_level")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Get latest repair intelligence
    const { data: repairIntelligence, error: repairError } = await supabase
      .from("repair_intelligence")
      .select(`
        *,
        repair_scores (
          *,
          repair_score,
          score_band,
          urgency_score,
          water_intrusion_score,
          storm_source_score,
          homeowner_frustration_score,
          photo_evidence_score,
          insurance_involvement_score,
          roof_age_score,
          neighborhood_patterns_score
        ),
        repair_events (
          *,
          event_type,
          event_description,
          created_at,
          metadata
        )
      `)
      .eq("contact_id", contactId)
      .order("detected_at", { ascending: false })
      .limit(10);

    if (repairError) {
      console.error("Error fetching repair intelligence:", repairError);
      return NextResponse.json(
        { error: "Failed to fetch repair intelligence" },
        { status: 500 }
      );
    }

    // Get latest repair intelligence record
    const latestRepair = repairIntelligence?.[0] || null;

    // Get repair metrics for this contact
    const { data: repairStats } = await supabase
      .from("repair_intelligence")
      .select("id, status, repair_type, repair_score")
      .eq("contact_id", contactId);

    const stats = {
      total_repairs: repairStats?.length || 0,
      completed_repairs: repairStats?.filter((r) => r.status === "completed").length || 0,
      average_score: repairStats?.length
        ? Math.round(
            repairStats.reduce((sum, r) => sum + (r.repair_score || 0), 0) /
              repairStats.length
          )
        : 0,
      repair_types: repairStats?.reduce((acc: Record<string, number>, r) => {
        acc[r.repair_type] = (acc[r.repair_type] || 0) + 1;
        return acc;
      }, {}) || {},
    };

    return NextResponse.json({
      contact: {
        id: contact.id,
        repair_opportunity_detected: contact.repair_opportunity_detected,
        repair_score: contact.repair_score,
        repair_urgency_level: contact.repair_urgency_level,
      },
      latest_repair: latestRepair,
      all_repairs: repairIntelligence || [],
      stats,
    });
  } catch (error) {
    console.error("Error in GET /api/repair/contact/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































