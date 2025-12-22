import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/inbox/revenue/threads/[threadId]/estimate
 * Update estimated value and/or probability score for a thread
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
    const { thread_estimated_value, close_probability_score, revenue_metadata } = body;

    // Get thread to verify access
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("campaign_id")
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
      .select("id")
      .eq("id", thread.campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (thread_estimated_value !== undefined) {
      updates.thread_estimated_value = thread_estimated_value;
    }

    if (close_probability_score !== undefined) {
      if (close_probability_score < 0 || close_probability_score > 100) {
        return NextResponse.json(
          { error: "close_probability_score must be between 0 and 100" },
          { status: 400 }
        );
      }
      updates.close_probability_score = close_probability_score;
    }

    if (revenue_metadata !== undefined) {
      updates.revenue_metadata = revenue_metadata;
    }

    // Update thread
    const { data, error } = await supabase
      .from("inbox_threads")
      .update(updates)
      .eq("id", threadId)
      .select()
      .single();

    if (error) {
      console.error("Error updating estimate:", error);
      return NextResponse.json(
        { error: "Failed to update estimate" },
        { status: 500 }
      );
    }

    return NextResponse.json({ thread: data });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/threads/[threadId]/estimate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































