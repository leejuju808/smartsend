import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/inbox/unified/[id] - Get single message with thread
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const messageId = params.id;

  try {
    // Get the message
    const { data: message, error: messageError } = await supabaseAdmin
      .from("inbox_messages")
      .select(
        `
        id,
        subject,
        body,
        body_html,
        sender,
        sender_email,
        recipient,
        recipient_email,
        direction,
        intent,
        replied,
        requires_followup,
        thread_id,
        provider,
        created_at,
        read_at,
        classified_at,
        lead_id,
        campaign_id,
        metadata,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          status
        ),
        campaigns:campaign_id (
          id,
          name
        )
        `
      )
      .eq("id", messageId)
      .eq("workspace_id", workspace_id)
      .single();

    if (messageError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Get thread messages if thread_id exists
    let threadMessages: any[] = [];
    if (message.thread_id) {
      const { data: thread } = await supabaseAdmin
        .from("inbox_messages")
        .select("*")
        .eq("thread_id", message.thread_id)
        .eq("workspace_id", workspace_id)
        .order("created_at", { ascending: true });

      threadMessages = thread || [];
    }

    // Mark as read
    if (!message.read_at) {
      await supabaseAdmin
        .from("inbox_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", messageId)
        .catch((err) => console.error("Error marking as read:", err));
    }

    return NextResponse.json({
      message: {
        ...message,
        lead: message.leads,
        campaign: message.campaigns,
      },
      thread: threadMessages,
    });
  } catch (error) {
    console.error("Error fetching message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/inbox/unified/[id] - Update message (mark as read, update intent, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const messageId = params.id;
  const body = await req.json();

  try {
    const updates: any = {};

    if (body.read !== undefined) {
      updates.read_at = body.read ? new Date().toISOString() : null;
    }

    if (body.replied !== undefined) {
      updates.replied = body.replied;
    }

    if (body.requires_followup !== undefined) {
      updates.requires_followup = body.requires_followup;
    }

    if (body.intent) {
      updates.intent = body.intent;
    }

    const { data: message, error: updateError } = await supabaseAdmin
      .from("inbox_messages")
      .update(updates)
      .eq("id", messageId)
      .eq("workspace_id", workspace_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating message:", updateError);
      return NextResponse.json(
        { error: "Failed to update message" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Error updating message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































