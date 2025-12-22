import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Action = "archive"|"unarchive"|"mark_read"|"mark_unread"|"stop_future_steps";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { thread_ids, action } = await req.json() as { thread_ids: string[], action: Action };
  if (!Array.isArray(thread_ids) || thread_ids.length === 0) {
    return NextResponse.json({ error: "thread_ids required" }, { status: 400 });
  }

  // Handle stop_future_steps action
  if (action === "stop_future_steps") {
    // Update threads to mark stopped_by_reply
    const { error: updateError } = await supabase
      .from("inbox_threads")
      .update({ stopped_by_reply: true })
      .in("id", thread_ids);
    
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    // Cancel future queue items for each thread
    let canceledCount = 0;
    for (const threadId of thread_ids) {
      const { data, error: rpcError } = await supabase.rpc("cancel_future_queue_for_thread", {
        p_thread: threadId
      });
      if (!rpcError && data) canceledCount += data;
    }

    return NextResponse.json({ ok: true, updated: thread_ids.length, canceled: canceledCount });
  }

  let patch: any = {};
  if (action === "archive") patch = { archived_at: new Date().toISOString() };
  if (action === "unarchive") patch = { archived_at: null };
  if (action === "mark_read") patch = { unread: false };
  if (action === "mark_unread") patch = { unread: true };
  if (!Object.keys(patch).length) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const { error } = await supabase
    .from("inbox_threads")
    .update(patch)
    .in("id", thread_ids)
    .eq("user_id", user.id); // Security: only update own threads

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, updated: thread_ids.length });
}



