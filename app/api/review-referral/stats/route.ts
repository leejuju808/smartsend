// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// API Route: Get Review & Referral Stats
// Returns dashboard statistics for review and referral engine

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    // Get review stats
    const { data: reviewRequests, error: reviewError } = await supabase
      .from("review_requests")
      .select("id, status, created_at, clicked_at, reviewed_at")
      .eq("workspace_id", workspaceId);

    if (reviewError) {
      console.error("Error fetching review requests:", reviewError);
    }

    // Get referral stats
    const { data: referrals, error: referralError } = await supabase
      .from("referrals")
      .select("id, status, created_at")
      .eq("workspace_id", workspaceId);

    if (referralError) {
      console.error("Error fetching referrals:", referralError);
    }

    // Get homeowner stats
    const { data: homeowners, error: homeownerError } = await supabase
      .from("homeowner_profiles")
      .select("referrals_count, reviews_requested, reviews_completed")
      .eq("workspace_id", workspaceId);

    if (homeownerError) {
      console.error("Error fetching homeowners:", homeownerError);
    }

    // Calculate stats
    const reviewsRequested = reviewRequests?.length || 0;
    const reviewsClicked = reviewRequests?.filter((r) => r.clicked_at).length || 0;
    const reviewsCompleted = reviewRequests?.filter((r) => r.reviewed_at).length || 0;
    const referralLeads = referrals?.length || 0;
    const referralBooked = referrals?.filter((r) => r.status === "booked").length || 0;
    const referralClosed = referrals?.filter((r) => r.status === "closed").length || 0;
    const totalReferrals = homeowners?.reduce((sum, h) => sum + (h.referrals_count || 0), 0) || 0;
    const totalReviewsRequested = homeowners?.reduce((sum, h) => sum + (h.reviews_requested || 0), 0) || 0;
    const totalReviewsCompleted = homeowners?.reduce((sum, h) => sum + (h.reviews_completed || 0), 0) || 0;

    // Calculate conversion rates
    const reviewClickRate = reviewsRequested > 0 ? (reviewsClicked / reviewsRequested) * 100 : 0;
    const reviewCompletionRate = reviewsRequested > 0 ? (reviewsCompleted / reviewsRequested) * 100 : 0;
    const referralConversionRate = referralLeads > 0 ? ((referralBooked + referralClosed) / referralLeads) * 100 : 0;

    return NextResponse.json({
      ok: true,
      stats: {
        reviews: {
          requested: reviewsRequested,
          clicked: reviewsClicked,
          completed: reviewsCompleted,
          clickRate: Math.round(reviewClickRate * 100) / 100,
          completionRate: Math.round(reviewCompletionRate * 100) / 100,
        },
        referrals: {
          total: referralLeads,
          booked: referralBooked,
          closed: referralClosed,
          conversionRate: Math.round(referralConversionRate * 100) / 100,
        },
        homeowners: {
          total: homeowners?.length || 0,
          totalReferrals: totalReferrals,
          totalReviewsRequested: totalReviewsRequested,
          totalReviewsCompleted: totalReviewsCompleted,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching review/referral stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch stats" },
      { status: 500 }
    );
  }
}


































