// Block 13300 — SmartSend Inbox v2 API
// POST /api/inbox/v2/mark-read
// Mark thread(s) as read

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

  const { thread_ids } = await req.json();

  if (!thread_ids || !Array.isArray(thread_ids)) {
    return NextResponse.json(
      { error: "thread_ids array required" },
      { status: 400 }
    );
  }

  // Mark multiple threads as read
  const { error } = await supabase
    .from("reply_threads")
    .update({
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .in("id", thread_ids);

  if (error) {
    console.error("Mark read error:", error);
    return NextResponse.json({ error: "Failed to mark threads as read" }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: thread_ids.length });
}





















































