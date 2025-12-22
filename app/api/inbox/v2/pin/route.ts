// Block 13300 — SmartSend Inbox v2 API
// POST /api/inbox/v2/pin
// Pin or unpin a thread

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

  const { thread_id, pinned } = await req.json();

  if (!thread_id || typeof pinned !== "boolean") {
    return NextResponse.json(
      { error: "thread_id and pinned (boolean) required" },
      { status: 400 }
    );
  }

  // Call the pin_thread function
  const { error } = await supabase.rpc("pin_thread", {
    p_thread_id: thread_id,
    p_pinned: pinned,
  });

  if (error) {
    console.error("Pin thread error:", error);
    return NextResponse.json({ error: "Failed to pin thread" }, { status: 500 });
  }

  return NextResponse.json({ success: true, pinned });
}





















































