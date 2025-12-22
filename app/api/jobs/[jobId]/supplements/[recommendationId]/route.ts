// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// API Route: PATCH /api/jobs/[jobId]/supplements/[recommendationId]
// Updates the status of a supplement recommendation

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; recommendationId: string }> }
) {
  try {
    const { jobId, recommendationId } = await params;
    const { status } = await req.json();

    if (!status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "submitted", "approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update the recommendation status
    const { data: recommendation, error } = await supabase
      .from("roofing_supplement_recommendations")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recommendationId)
      .eq("job_id", jobId)
      .select()
      .single();

    if (error) {
      console.error("Error updating recommendation:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ recommendation });
  } catch (error: any) {
    console.error("Error in PATCH /api/jobs/[jobId]/supplements/[recommendationId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































