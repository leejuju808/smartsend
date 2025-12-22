import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/activity-feed/summary
 * Generate AI summary for a lead when 6+ events occur in <24 hours
 * 
 * Query params:
 * - lead_id: Required - Lead ID to generate summary for
 * - hours_back: Hours to look back (default: 24)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");
    const hoursBack = parseInt(searchParams.get("hours_back") || "24", 10);

    if (!leadId) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data: summary, error } = await supabase.rpc(
      "generate_activity_summary",
      {
        p_lead_id: leadId,
        p_hours_back: hoursBack,
      }
    );

    if (error) {
      console.error("Error generating activity summary:", error);
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 500 }
      );
    }

    return NextResponse.json({ summary: summary || null });
  } catch (error) {
    console.error("Error in activity summary API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
















































