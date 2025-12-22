// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Submit Rating (1-5 stars)
// POST /api/reviews/submit-rating
// Routes 1-3 stars to internal feedback, 4-5 stars to Google push

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { review_request_id, rating, feedback } = body;

    if (!review_request_id || !rating) {
      return NextResponse.json(
        { error: "review_request_id and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Get review request
    const { data: reviewRequest, error: fetchError } = await supabase
      .from("review_requests")
      .select("*")
      .eq("id", review_request_id)
      .single();

    if (fetchError || !reviewRequest) {
      return NextResponse.json(
        { error: "Review request not found" },
        { status: 404 }
      );
    }

    // Call database function to handle rating submission
    const { error: handleError } = await supabase.rpc(
      "handle_review_rating_submission",
      {
        p_review_request_id: review_request_id,
        p_rating: rating,
        p_feedback: feedback || null,
      }
    );

    if (handleError) {
      console.error("Error handling rating submission:", handleError);
      return NextResponse.json(
        { error: handleError.message || "Failed to handle rating submission" },
        { status: 500 }
      );
    }

    // Get updated review request
    const { data: updatedRequest, error: updateError } = await supabase
      .from("review_requests")
      .select("*")
      .eq("id", review_request_id)
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to fetch updated review request" },
        { status: 500 }
      );
    }

    // Determine response based on rating
    const isPositive = rating >= 4;
    const nextAction = isPositive ? "google_push" : "internal_feedback";

    return NextResponse.json(
      {
        success: true,
        rating,
        review_stage: updatedRequest.review_stage,
        next_action: nextAction,
        message: isPositive
          ? "Thank you! We'll send you a Google review link."
          : "We're sorry to hear that. Please share your feedback so we can improve.",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error submitting rating:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































