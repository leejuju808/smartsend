// Block 20230 — Lost Reason API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversation_id,
      lost_reason_category,
      lost_reason_detail,
      lost_to_competitor_name,
      lost_to_competitor_bid,
    } = body;

    if (!conversation_id || !lost_reason_category) {
      return NextResponse.json(
        { error: "conversation_id and lost_reason_category required" },
        { status: 400 }
      );
    }

    // Get thread to find campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Lost reason thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const updatePayload: any = {
      lead_stage: "lost",
      lost_reason_category,
      lost_reason_detail: lost_reason_detail || null,
      lost_to_competitor_name: lost_to_competitor_name || null,
      lost_to_competitor_bid: lost_to_competitor_bid
        ? Number(lost_to_competitor_bid)
        : null,
    };

    const { data: convo, error: convoErr } = await supabase
      .from("inbox_threads")
      .update(updatePayload)
      .eq("id", conversation_id)
      .select()
      .single();

    if (convoErr) {
      console.error("Lost reason update error", convoErr);
      return NextResponse.json(
        { error: "Failed to update lost reason" },
        { status: 500 }
      );
    }

    // Log in activity
    const { error: logErr } = await supabase.from("inbox_activity_log").insert({
      thread_id: conversation_id,
      campaign_id: thread.campaign_id,
      user_id: user.id,
      type: "lost",
      title: "Job marked lost",
      body: lost_reason_detail || null,
      meta: {
        lost_reason_category,
        lost_to_competitor_name: lost_to_competitor_name || null,
        lost_to_competitor_bid: lost_to_competitor_bid
          ? Number(lost_to_competitor_bid)
          : null,
      },
    });

    if (logErr) {
      console.error("Lost reason activity error", logErr);
      // Not fatal for API consumer
    }

    return NextResponse.json({ conversation: convo });
  } catch (error: any) {
    console.error("Error in lost-reason route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































