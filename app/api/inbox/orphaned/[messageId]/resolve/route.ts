import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Block 19700 — Resolve Orphaned Message
 * Assigns orphaned message to contact, campaign, and optionally thread
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { messageId } = params;
    const body = await request.json();
    const { contact_id, campaign_id, thread_id } = body;

    if (!contact_id || !campaign_id) {
      return NextResponse.json(
        { error: "contact_id and campaign_id are required" },
        { status: 400 }
      );
    }

    // Get the orphaned message
    const { data: message, error: messageError } = await supabase
      .from("inbox_messages")
      .select("*")
      .eq("id", messageId)
      .eq("is_orphaned", true)
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message not found or not orphaned" },
        { status: 404 }
      );
    }

    // Find or create thread
    let finalThreadId = thread_id;

    if (!finalThreadId) {
      // Try to find existing thread
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("contact_id", contact_id)
        .eq("campaign_id", campaign_id)
        .maybeSingle();

      if (existingThread) {
        finalThreadId = existingThread.id;
      } else {
        // Create new thread
        const { data: newThread, error: threadError } = await supabase
          .from("inbox_threads")
          .insert({
            contact_id,
            campaign_id,
            status: "open",
            last_message_at: message.received_at,
          })
          .select("id")
          .single();

        if (threadError) {
          return NextResponse.json(
            { error: `Failed to create thread: ${threadError.message}` },
            { status: 500 }
          );
        }

        finalThreadId = newThread.id;
      }
    }

    // Update message with resolved values
    const { error: updateError } = await supabase
      .from("inbox_messages")
      .update({
        contact_id,
        campaign_id,
        thread_id: finalThreadId,
        is_orphaned: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update message: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Log QA event
    await supabase.rpc("log_qa_event", {
      p_event_type: "orphan_resolved",
      p_payload: {
        message_id: messageId,
        contact_id,
        campaign_id,
        thread_id: finalThreadId,
      },
      p_message_id: messageId,
      p_contact_id: contact_id,
      p_thread_id: finalThreadId,
    });

    // Re-run AI classifier if needed (triggered by background job)
    // For now, we'll leave ai_intent as is (it was set to 'warm' as default)

    return NextResponse.json({
      success: true,
      message_id: messageId,
      thread_id: finalThreadId,
    });
  } catch (error: any) {
    console.error("Error in POST /api/inbox/orphaned/[messageId]/resolve:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































