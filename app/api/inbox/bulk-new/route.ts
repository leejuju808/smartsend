import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const sb = createClient();
  const { action, threadIds } = await req.json(); // action: "mark_read"|"mark_unread"|"archive"|"assign"
  
  if (!Array.isArray(threadIds) || !threadIds.length) {
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_read") {
    await Promise.all(
      threadIds.map((id: string) => 
        sb.rpc("thread_mark_read", { p_thread_id: id })
      )
    );
  } else if (action === "mark_unread") {
    await Promise.all(
      threadIds.map((id: string) => 
        sb.rpc("thread_mark_unread", { p_thread_id: id })
      )
    );
  } else if (action === "archive") {
    // Update archived flag on threads
    await sb
      .from("email_threads")
      .update({ archived: true })
      .in("id", threadIds);
  }
  
  return NextResponse.json({ ok: true });
}















