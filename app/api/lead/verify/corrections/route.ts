/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * GET /api/lead/verify/corrections
 * Get lead correction suggestions based on verification results
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("contact_id");
    const leadId = searchParams.get("lead_id");

    if (!contactId && !leadId) {
      return NextResponse.json(
        { error: "contact_id or lead_id is required" },
        { status: 400 }
      );
    }

    // Call database function to get suggestions
    const { data: suggestions, error } = await supabase.rpc(
      "get_lead_correction_suggestions",
      {
        p_contact_id: contactId || null,
        p_lead_id: leadId || null,
      }
    );

    if (error) {
      console.error("Error getting correction suggestions:", error);
      return NextResponse.json(
        { error: "Failed to get correction suggestions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      suggestions: suggestions || [],
    });
  } catch (error: any) {
    console.error("Error getting corrections:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get corrections" },
      { status: 500 }
    );
  }
}





















































