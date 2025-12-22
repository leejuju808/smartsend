// Block 21230 — SmartSend Roofing "Next Best Action" Brain v1
// Weekly Action Summary API endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/campaigns/[id]/weekly-action-summary
 * Get weekly action summary for a campaign
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get weekly action summary
    const { data: summary, error: summaryError } = await supabase.rpc(
      "get_weekly_action_summary",
      {
        p_campaign_id: id,
      }
    );

    if (summaryError) {
      return NextResponse.json(
        { error: "Failed to get weekly action summary", details: summaryError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary: summary || {},
    });
  } catch (error: any) {
    console.error("Error in GET /api/campaigns/[id]/weekly-action-summary:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
















































