import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/laws/applyToInsurance
 * 
 * Applies state laws to insurance suggestions and logic.
 * Filters out illegal suggestions and adds compliant alternatives.
 */
export async function POST(req: NextRequest) {
  try {
    const { state_code, insurance_suggestions, contact_id, workspace_id } = await req.json();

    if (!state_code || typeof state_code !== "string") {
      return NextResponse.json(
        { error: "state_code is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call the edge function via Supabase client
    const { data, error } = await supabase.functions.invoke("laws-apply-to-insurance", {
      body: {
        state_code: state_code.toUpperCase(),
        insurance_suggestions,
        contact_id,
        workspace_id,
      },
    });

    if (error) {
      console.error("[State Laws API] Error applying to insurance:", error);
      return NextResponse.json(
        { error: "Failed to apply laws to insurance", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("[State Laws API] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































