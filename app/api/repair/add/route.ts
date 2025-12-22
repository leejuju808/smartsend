import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/repair/add
 * Manually add a repair opportunity or trigger detection
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      contact_id,
      message_text,
      detection_source = "manual",
      repair_type,
      urgency_level,
      photo_urls,
      metadata = {},
    } = body;

    if (!contact_id) {
      return NextResponse.json(
        { error: "contact_id is required" },
        { status: 400 }
      );
    }

    // Verify contact exists and get workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    let repairIntelligenceId: string | null = null;

    // If message_text provided, use detection function
    if (message_text) {
      const { data: detectResult, error: detectError } = await supabase.rpc(
        "detect_repair_opportunity",
        {
          p_contact_id: contact_id,
          p_message_text: message_text,
          p_detection_source: detection_source,
          p_metadata: metadata,
        }
      );

      if (detectError) {
        console.error("Error detecting repair:", detectError);
        return NextResponse.json(
          { error: "Failed to detect repair opportunity" },
          { status: 500 }
        );
      }

      repairIntelligenceId = detectResult;
    }

    // If repair_type provided or manual entry, create directly
    if (!repairIntelligenceId && repair_type) {
      const { data: repairData, error: repairError } = await supabase
        .from("repair_intelligence")
        .insert({
          contact_id,
          workspace_id: contact.workspace_id,
          repair_type,
          detected_at: new Date().toISOString(),
          detection_source,
          urgency_level: urgency_level || "uncertain",
          photo_evidence_urls: photo_urls ? JSON.stringify(photo_urls) : "[]",
          metadata,
        })
        .select()
        .single();

      if (repairError) {
        console.error("Error creating repair:", repairError);
        return NextResponse.json(
          { error: "Failed to create repair opportunity" },
          { status: 500 }
        );
      }

      repairIntelligenceId = repairData.id;

      // Calculate repair score
      await supabase.rpc("calculate_repair_score", {
        p_repair_intelligence_id: repairIntelligenceId,
      });

      // Create auto tasks
      await supabase.rpc("create_repair_auto_tasks", {
        p_repair_intelligence_id: repairIntelligenceId,
      });

      // Check for replacement upsell
      await supabase.rpc("check_repair_replacement_upsell", {
        p_repair_intelligence_id: repairIntelligenceId,
      });
    }

    if (!repairIntelligenceId) {
      return NextResponse.json(
        { error: "Failed to create repair opportunity" },
        { status: 500 }
      );
    }

    // Get created repair intelligence
    const { data: repairIntelligence, error: fetchError } = await supabase
      .from("repair_intelligence")
      .select("*")
      .eq("id", repairIntelligenceId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch created repair" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      repair_intelligence: repairIntelligence,
      repair_id: repairIntelligenceId,
    });
  } catch (error) {
    console.error("Error in POST /api/repair/add:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































