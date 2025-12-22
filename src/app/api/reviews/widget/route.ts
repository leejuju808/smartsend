// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Get Review Widget Data
// GET /api/reviews/widget

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");
    const limit = parseInt(searchParams.get("limit") || "5");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get completed reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from("review_requests")
      .select(
        `
        rating,
        completed_at,
        review_platform,
        leads:lead_id(
          first_name,
          last_name,
          name
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .not("rating", "is", null)
      .order("completed_at", { ascending: false })
      .limit(limit);

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError);
    }

    // Calculate average rating and total
    const validReviews = reviews?.filter((r) => r.rating !== null) || [];
    const avgRating =
      validReviews.length > 0
        ? validReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / validReviews.length
        : 0;

    // Format recent reviews
    const recentReviews =
      reviews?.map((review) => ({
        rating: review.rating || 0,
        lead_name:
          review.leads?.first_name ||
          review.leads?.name ||
          "Anonymous Customer",
        completed_at: review.completed_at,
        review_platform: review.review_platform,
      })) || [];

    return NextResponse.json({
      success: true,
      avg_rating: avgRating,
      total_reviews: validReviews.length,
      recent_reviews: recentReviews,
    });
  } catch (error: any) {
    console.error("Error fetching widget data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































