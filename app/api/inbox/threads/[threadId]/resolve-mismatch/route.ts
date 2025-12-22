import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Block 19700 — Resolve Thread Mismatch
 * Handles thread mismatch resolution (split, assign, or ignore)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { threadId } = params;
    const body = await request.json();
    const { action } = body; // "split", "assign", or "ignore"

    if (!["split", "assign", "ignore"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'split', 'assign', or 'ignore'" },
        { status: 400 }
      );
    }

    // Get thread with messages
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("received_at", { ascending: true });

    if (action === "ignore") {
      // Simply clear the warning flag on all messages
      await supabase
        .from("inbox_messages")
        .update({ thread_mismatch_warning: false })
        .eq("thread_id", threadId);

      await supabase.rpc("log_qa_event", {
        p_event_type: "thread_mismatch_ignored",
        p_payload: { thread_id: threadId },
        p_thread_id: threadId,
      });

      return NextResponse.json({ success: true, action: "ignored" });
    }

    if (action === "split") {
      // Find the mismatched message (usually the last one with different email)
      if (!messages || messages.length < 2) {
        return NextResponse.json(
          { error: "Not enough messages to split" },
          { status: 400 }
        );
      }

      // Get unique from_emails in thread
      const emails = [...new Set(messages.map((m) => m.from_email?.toLowerCase()))];
      
      if (emails.length < 2) {
        return NextResponse.json(
          { error: "No mismatch detected (all messages from same email)" },
          { status: 400 }
        );
      }

      // Find the last message with a different email
      const lastMessage = messages[messages.length - 1];
      const firstEmail = messages[0].from_email?.toLowerCase();
      const mismatchedMessages = messages.filter(
        (m) => m.from_email?.toLowerCase() !== firstEmail
      );

      if (mismatchedMessages.length === 0) {
        return NextResponse.json(
          { error: "Could not identify mismatched messages" },
          { status: 400 }
        );
      }

      // Create new thread for mismatched messages
      const { data: newThread, error: newThreadError } = await supabase
        .from("inbox_threads")
        .insert({
          contact_id: mismatchedMessages[0].contact_id,
          campaign_id: mismatchedMessages[0].campaign_id || thread.campaign_id,
          status: "open",
          last_message_at: mismatchedMessages[mismatchedMessages.length - 1].received_at,
        })
        .select("id")
        .single();

      if (newThreadError) {
        return NextResponse.json(
          { error: `Failed to create new thread: ${newThreadError.message}` },
          { status: 500 }
        );
      }

      // Move mismatched messages to new thread
      await supabase
        .from("inbox_messages")
        .update({
          thread_id: newThread.id,
          thread_mismatch_warning: false,
        })
        .in("id", mismatchedMessages.map((m) => m.id));

      // Clear warnings on remaining messages
      await supabase
        .from("inbox_messages")
        .update({ thread_mismatch_warning: false })
        .eq("thread_id", threadId)
        .not("id", "in", `(${mismatchedMessages.map((m) => m.id).join(",")})`);

      await supabase.rpc("log_qa_event", {
        p_event_type: "thread_mismatch_split",
        p_payload: {
          original_thread_id: threadId,
          new_thread_id: newThread.id,
          moved_message_ids: mismatchedMessages.map((m) => m.id),
        },
        p_thread_id: threadId,
      });

      return NextResponse.json({
        success: true,
        action: "split",
        new_thread_id: newThread.id,
      });
    }

    if (action === "assign") {
      // This would require additional UI to select target contact/thread
      // For now, we'll just clear the warning
      await supabase
        .from("inbox_messages")
        .update({ thread_mismatch_warning: false })
        .eq("thread_id", threadId);

      await supabase.rpc("log_qa_event", {
        p_event_type: "thread_mismatch_assigned",
        p_payload: { thread_id: threadId },
        p_thread_id: threadId,
      });

      return NextResponse.json({
        success: true,
        action: "assigned",
        message: "Warning cleared. Manual assignment required.",
      });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/inbox/threads/[threadId]/resolve-mismatch:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































