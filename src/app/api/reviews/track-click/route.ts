// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Track Review Link Click
// POST /api/reviews/track-click

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { review_request_id, platform } = body;

    if (!review_request_id) {
      return NextResponse.json(
        { error: "review_request_id is required" },
        { status: 400 }
      );
    }

    // Update review request to track click
    const { data: reviewRequest, error: updateError } = await supabase
      .from("review_requests")
      .update({
        clicked_at: new Date().toISOString(),
        review_link_clicked: true,
        status: "clicked",
        review_platform: platform || null,
        opened_at: new Date().toISOString(),
      })
      .eq("id", review_request_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error tracking review click:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to track click" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      review_request: reviewRequest,
    });
  } catch (error: any) {
    console.error("Error tracking review click:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































