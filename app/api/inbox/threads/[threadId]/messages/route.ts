import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Block 19700 — Get Thread Messages with Long Thread Handling
 * Returns messages for a thread, with support for pagination and archiving older messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { threadId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const includeArchived = searchParams.get("include_archived") === "true";

    // Get thread info
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("message_count")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // For threads with 50+ messages, only show recent 50 by default
    const effectiveLimit = thread.message_count >= 50 && !includeArchived ? 50 : limit;

    // Get messages (most recent first)
    const { data: messages, error: messagesError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("received_at", { ascending: false })
      .range(offset, offset + effectiveLimit - 1);

    if (messagesError) {
      return NextResponse.json(
        { error: `Failed to fetch messages: ${messagesError.message}` },
        { status: 500 }
      );
    }

    // Reverse to show oldest first (for display)
    const sortedMessages = (messages || []).reverse();

    return NextResponse.json({
      messages: sortedMessages,
      total: thread.message_count,
      has_more: thread.message_count > offset + effectiveLimit,
      is_long_thread: thread.message_count >= 50,
      archived_count: thread.message_count >= 50 ? Math.max(0, thread.message_count - 50) : 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/inbox/threads/[threadId]/messages:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
