// Block 20130 — Add Internal Note
// POST /api/inbox/note

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { conversation_id, note } = await req.json();

  if (!conversation_id || !note) {
    return NextResponse.json(
      { error: "conversation_id and note required" },
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
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 }
    );
  }

  // 1) Insert into activity log
  const { error: logError } = await supabase
    .from("inbox_activity_log")
    .insert({
      thread_id: conversation_id,
      campaign_id: thread.campaign_id,
      user_id: user.id,
      type: "note",
      title: "Internal note added",
      body: note.trim(),
    });

  if (logError) {
    console.error("Activity log insert error", logError);
    return NextResponse.json(
      { error: "Failed to save note" },
      { status: 500 }
    );
  }

  // 2) Also update internal_notes on thread (latest note)
  const { data: updatedThread, error: convoError } = await supabase
    .from("inbox_threads")
    .update({ internal_notes: note.trim() })
    .eq("id", conversation_id)
    .select()
    .single();

  if (convoError) {
    console.error("Thread note update error", convoError);
    return NextResponse.json(
      { error: "Note saved but failed to update thread" },
      { status: 500 }
    );
  }

  return NextResponse.json({ conversation: updatedThread });
}

