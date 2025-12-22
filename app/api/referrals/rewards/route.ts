import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals/rewards
 * Get referral rewards for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get referral rewards with related data
    const { data: rewards, error } = await supabase
      .from("referral_rewards")
      .select(`
        *,
        referral_links!inner(
          id,
          portal_id,
          homeowner_portals!inner(
            id,
            roofing_jobs!inner(
              id,
              workspace_id,
              leads(
                id,
                first_name,
                last_name
              )
            )
          )
        )
      `)
      .eq("referral_links.homeowner_portals.roofing_jobs.workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referral rewards:", error);
      return NextResponse.json(
        { error: "Failed to fetch referral rewards" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rewards: rewards || [] });
  } catch (error: any) {
    console.error("Error in GET /api/referrals/rewards:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























