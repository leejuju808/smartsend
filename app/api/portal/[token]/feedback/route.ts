// Block 83000 — SmartSend Roofing Homeowner Portal v1
// API Route: Submit Feedback (Public)
// POST /api/portal/[token]/feedback

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient();
    const { token } = await params;

    // Get portal by token
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id")
      .eq("portal_token", token)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Portal not found or inactive" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { rating, comment, willing_to_review } = body;

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Create feedback
    const { data: feedback, error: feedbackError } = await supabase
      .from("homeowner_feedback")
      .insert({
        portal_id: portal.id,
        job_id: portal.job_id,
        rating,
        comment,
        willing_to_review: willing_to_review || false,
      })
      .select()
      .single();

    if (feedbackError) {
      console.error("Error creating feedback:", feedbackError);
      return NextResponse.json(
        { error: feedbackError.message || "Failed to submit feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error: any) {
    console.error("Error submitting feedback:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























