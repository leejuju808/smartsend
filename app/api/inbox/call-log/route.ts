// Block 20200 — Call Outcome Logger API

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
      outcome, // 'answered' | 'left_vm' | 'no_answer' | 'wrong_number'
      note,
      schedule_follow_up_days, // optional number
    } = body;

    if (!conversation_id || !outcome) {
      return NextResponse.json(
        { error: "conversation_id and outcome required" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // 1) Load current thread to compute new call_count and get campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, call_count, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Call log thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const newCallCount = (thread.call_count || 0) + 1;

    // 2) Compute follow-up time if requested
    let nextActionAt: string | null = null;
    if (
      typeof schedule_follow_up_days === "number" &&
      schedule_follow_up_days > 0
    ) {
      const d = new Date();
      d.setDate(d.getDate() + schedule_follow_up_days);
      nextActionAt = d.toISOString();
    }

    // 3) Update thread with call data
    const updatePayload: any = {
      call_count: newCallCount,
      last_call_at: nowIso,
      last_call_outcome: outcome,
      last_contact_method: "phone",
      last_contact_at: nowIso,
    };

    if (nextActionAt) {
      updatePayload.next_action_at = nextActionAt;
    }

    const { data: updatedThread, error: updateError } = await supabase
      .from("inbox_threads")
      .update(updatePayload)
      .eq("id", conversation_id)
      .select()
      .single();

    if (updateError) {
      console.error("Call log update error", updateError);
      return NextResponse.json(
        { error: "Failed to update conversation" },
        { status: 500 }
      );
    }

    // 4) Log into activity timeline
    const title = (() => {
      switch (outcome) {
        case "answered":
          return "Call completed";
        case "left_vm":
          return "Left voicemail";
        case "no_answer":
          return "No answer";
        case "wrong_number":
          return "Wrong number";
        default:
          return "Call logged";
      }
    })();

    const meta: any = {
      outcome,
      schedule_follow_up_days: schedule_follow_up_days || null,
    };

    const { error: logError } = await supabase
      .from("inbox_activity_log")
      .insert({
        thread_id: conversation_id,
        campaign_id: thread.campaign_id,
        user_id: user.id,
        type: "call",
        title,
        body: note || null,
        meta,
      });

    if (logError) {
      console.error("Call log activity error", logError);
      // not fatal for API consumer
    }

    // NEW — bump engagement
    await supabase.rpc("fn_update_conversation_engagement", {
      p_conversation_id: conversation_id,
    });

    return NextResponse.json({ conversation: updatedThread });
  } catch (error: any) {
    console.error("Error in call-log route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

