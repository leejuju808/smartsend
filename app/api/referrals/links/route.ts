import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/referrals/links
 * Get referral links for a workspace
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

    // Get referral links with related data
    const { data: referralLinks, error } = await supabase
      .from("referral_links")
      .select(`
        *,
        homeowner_portals!inner(
          id,
          job_id,
          roofing_jobs!inner(
            id,
            workspace_id,
            title,
            leads(
              id,
              first_name,
              last_name,
              email
            )
          )
        ),
        referral_leads(count)
      `)
      .eq("homeowner_portals.roofing_jobs.workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching referral links:", error);
      return NextResponse.json(
        { error: "Failed to fetch referral links" },
        { status: 500 }
      );
    }

    return NextResponse.json({ referralLinks });
  } catch (error: any) {
    console.error("Error in GET /api/referrals/links:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























