import { NextRequest, NextResponse } from "next/server";
import { submitSatisfactionFeedback } from "@/lib/homeowner-experience/block25700-automation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, jobId, contactId, checkpoint, rating, feedbackText, feedbackCategory } = body;

    // Validate required fields
    if (!workspaceId || !jobId || !contactId || !checkpoint || !rating) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, jobId, contactId, checkpoint, rating" },
        { status: 400 }
      );
    }

    // Validate checkpoint
    const validCheckpoints = ["post_inspection", "post_install", "post_invoice", "post_warranty", "overall"];
    if (!validCheckpoints.includes(checkpoint)) {
      return NextResponse.json(
        { error: "Invalid checkpoint" },
        { status: 400 }
      );
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Submit satisfaction feedback
    const result = await submitSatisfactionFeedback({
      workspaceId,
      jobId,
      contactId,
      checkpoint,
      rating,
      feedbackText,
      feedbackCategory,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to submit satisfaction feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      feedbackId: result.feedbackId,
    });
  } catch (error: any) {
    console.error("Error submitting satisfaction feedback:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































