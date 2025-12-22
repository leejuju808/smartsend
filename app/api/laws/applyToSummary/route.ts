import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/laws/applyToSummary
 * 
 * Adds state rule reminders to summaries for rep training.
 * Ensures reps always know the rules for their state.
 */
export async function POST(req: NextRequest) {
  try {
    const { state_code, summary_text, contact_id, workspace_id } = await req.json();

    if (!state_code || typeof state_code !== "string") {
      return NextResponse.json(
        { error: "state_code is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Call the edge function via Supabase client
    const { data, error } = await supabase.functions.invoke("laws-apply-to-summary", {
      body: {
        state_code: state_code.toUpperCase(),
        summary_text,
        contact_id,
        workspace_id,
      },
    });

    if (error) {
      console.error("[State Laws API] Error applying to summary:", error);
      return NextResponse.json(
        { error: "Failed to apply laws to summary", details: error.message },
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





















































