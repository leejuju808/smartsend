// Block 20130 — Fetch Conversation Activity Timeline
// GET /api/inbox/activity

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const conversation_id = searchParams.get("conversation_id");

  if (!conversation_id) {
    return NextResponse.json(
      { error: "conversation_id required" },
      { status: 400 }
    );
  }

  // Verify thread exists and user has access
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

  // Fetch activity log entries
  const { data, error } = await supabase
    .from("inbox_activity_log")
    .select("*")
    .eq("thread_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Activity fetch error", error);
    return NextResponse.json(
      { error: "Failed to load activity" },
      { status: 500 }
    );
  }

  return NextResponse.json({ activity: data || [] });
}

















































