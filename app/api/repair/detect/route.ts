import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/repair/detect
 * Trigger repair detection on a message or contact
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      contact_id,
      message_id,
      message_text,
      detection_source = "message",
      metadata = {},
    } = body;

    if (!contact_id) {
      return NextResponse.json(
        { error: "contact_id is required" },
        { status: 400 }
      );
    }

    if (!message_text && !message_id) {
      return NextResponse.json(
        { error: "Either message_text or message_id is required" },
        { status: 400 }
      );
    }

    let textToAnalyze = message_text;

    // If message_id provided, fetch message text
    if (message_id && !message_text) {
      const { data: message, error: messageError } = await supabase
        .from("inbox_messages")
        .select("body_text, body_html")
        .eq("id", message_id)
        .single();

      if (messageError || !message) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 }
        );
      }

      textToAnalyze = message.body_text || message.body_html || "";
    }

    if (!textToAnalyze) {
      return NextResponse.json(
        { error: "No text content to analyze" },
        { status: 400 }
      );
    }

    // Call detection function
    const { data: repairId, error: detectError } = await supabase.rpc(
      "detect_repair_opportunity",
      {
        p_contact_id: contact_id,
        p_message_text: textToAnalyze,
        p_detection_source: detection_source,
        p_metadata: {
          ...metadata,
          message_id: message_id || null,
          detected_at: new Date().toISOString(),
        },
      }
    );

    if (detectError) {
      console.error("Error detecting repair:", detectError);
      return NextResponse.json(
        { error: "Failed to detect repair opportunity", details: detectError.message },
        { status: 500 }
      );
    }

    if (!repairId) {
      return NextResponse.json({
        success: false,
        message: "No repair opportunity detected",
        repair_id: null,
      });
    }

    // Get created repair intelligence
    const { data: repairIntelligence, error: fetchError } = await supabase
      .from("repair_intelligence")
      .select("*")
      .eq("id", repairId)
      .single();

    if (fetchError) {
      return NextResponse.json({
        success: true,
        repair_id: repairId,
        message: "Repair detected but failed to fetch details",
      });
    }

    return NextResponse.json({
      success: true,
      repair_detected: true,
      repair_id: repairId,
      repair_intelligence: repairIntelligence,
    });
  } catch (error) {
    console.error("Error in POST /api/repair/detect:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































