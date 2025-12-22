import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/inbox/revenue/threads/[threadId]/pipeline
 * Update pipeline stage for a thread
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { threadId } = params;
    const body = await req.json();
    const { pipeline_stage } = body;

    if (!pipeline_stage) {
      return NextResponse.json(
        { error: "pipeline_stage is required" },
        { status: 400 }
      );
    }

    const validStages = [
      "new_lead",
      "contacted",
      "estimate_scheduled",
      "estimate_completed",
      "pending_decision",
      "won",
      "lost",
    ];

    if (!validStages.includes(pipeline_stage)) {
      return NextResponse.json(
        { error: "Invalid pipeline_stage" },
        { status: 400 }
      );
    }

    // Get thread to verify access
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("campaign_id, lead_id")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Verify user can edit this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, org_id")
      .eq("id", thread.campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Block 20840: Check permission to update pipeline stage
    // For threads, we check via lead_id if available
    if (thread.lead_id) {
      const { data: canUpdate, error: permError } = await supabase.rpc(
        "can_view_lead",
        { p_lead_id: thread.lead_id }
      );

      if (permError || !canUpdate) {
        return NextResponse.json(
          { error: "You don't have permission to update this lead's pipeline stage." },
          { status: 403 }
        );
      }
    }

    // Update pipeline stage
    const { data, error } = await supabase
      .from("inbox_threads")
      .update({
        pipeline_stage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .select()
      .single();

    if (error) {
      console.error("Error updating pipeline stage:", error);
      return NextResponse.json(
        { error: "Failed to update pipeline stage" },
        { status: 500 }
      );
    }

    return NextResponse.json({ thread: data });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/threads/[threadId]/pipeline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




