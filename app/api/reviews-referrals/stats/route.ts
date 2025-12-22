import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reviews-referrals/stats
 * Get statistics for reviews and referrals dashboard
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

    // Get review requests stats
    const { data: reviewRequests } = await supabase
      .from("review_requests")
      .select("status")
      .eq("homeowner_portals.roofing_jobs.workspace_id", workspaceId);

    const totalReviewRequests = reviewRequests?.length || 0;
    const completedReviews =
      reviewRequests?.filter((r) => r.status === "completed").length || 0;

    // Get referral links stats
    const { data: referralLinks } = await supabase
      .from("referral_links")
      .select("clicks, leads_generated")
      .eq("homeowner_portals.roofing_jobs.workspace_id", workspaceId);

    const totalReferrals = referralLinks?.length || 0;
    const leadsGenerated =
      referralLinks?.reduce((sum, link) => sum + (link.leads_generated || 0), 0) || 0;

    // Get referral leads that became jobs (simplified - would need to join with jobs table)
    const { data: referralLeads } = await supabase
      .from("referral_leads")
      .select("id")
      .eq("referral_links.homeowner_portals.roofing_jobs.workspace_id", workspaceId);

    // TODO: Calculate jobs closed and revenue from referrals
    // This would require joining with roofing_jobs table
    const jobsClosed = 0; // Placeholder
    const revenueFromReferrals = 0; // Placeholder

    return NextResponse.json({
      stats: {
        totalReviewRequests,
        completedReviews,
        totalReferrals,
        leadsGenerated,
        jobsClosed,
        revenueFromReferrals,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/reviews-referrals/stats:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























