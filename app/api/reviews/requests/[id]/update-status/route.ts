import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/reviews/requests/[id]/update-status
 * Update review request status (clicked, completed, ignored)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !["clicked", "completed", "ignored"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status is required (clicked, completed, ignored)" },
        { status: 400 }
      );
    }

    const { data: reviewRequest, error } = await supabase
      .from("review_requests")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating review request:", error);
      return NextResponse.json(
        { error: "Failed to update review request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reviewRequest });
  } catch (error: any) {
    console.error("Error in POST /api/reviews/requests/[id]/update-status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























