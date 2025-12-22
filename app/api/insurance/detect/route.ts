import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/insurance/detect
 * Trigger insurance detection for a contact
 * 
 * Body: {
 *   contact_id: string,
 *   text?: string, // Optional text to analyze
 *   source?: 'message' | 'pdf' | 'attachment' | 'manual'
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { contact_id, text, source = "manual" } = body;

    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }

    // Verify contact belongs to workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contact_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Detect insurance keywords if text provided
    let detected_keywords: string[] = [];
    let confidence = 0.5;

    if (text) {
      const detectionResult = await supabase.rpc("detect_insurance_keywords", {
        p_text: text,
        p_attachments: "[]"::jsonb,
      });

      if (detectionResult.data) {
        detected_keywords = (detectionResult.data as any).detected_keywords || [];
        confidence = (detectionResult.data as any).confidence || 0.5;
      }
    }

    // Auto-apply insurance detection
    const result = await supabase.rpc("auto_apply_insurance_detection", {
      p_contact_id: contact_id,
      p_detection_source: source,
      p_detected_keywords: detected_keywords,
      p_confidence: confidence,
    });

    if (result.error) {
      console.error("Error applying insurance detection:", result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      contact_id,
      detection_result: result.data,
      message: "Insurance detection completed",
    });
  } catch (error: any) {
    console.error("Error in POST /api/insurance/detect:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































