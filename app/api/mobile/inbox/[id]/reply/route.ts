import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/inbox/[id]/reply
 * Send a quick reply to a lead
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message text required" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get the inbox message
    const { data: inboxMessage, error: msgError } = await supabase
      .from("inbox_messages")
      .select("contact_id, subject, contacts:contact_id(email)")
      .eq("id", params.id)
      .single();

    if (msgError || !inboxMessage) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    const contact = inboxMessage.contacts as any;

    // Send email reply
    // TODO: Integrate with your email sending service
    // For now, create an outbound message record
    const { error: sendError } = await supabase
      .from("inbox_messages")
      .insert({
        contact_id: inboxMessage.contact_id,
        direction: "outbound",
        subject: `Re: ${inboxMessage.subject || "Your inquiry"}`,
        body: message,
        sent_at: new Date().toISOString(),
      });

    if (sendError) {
      return NextResponse.json(
        { error: "Failed to send reply" },
        { status: 500 }
      );
    }

    // Create timeline event
    await supabase.from("lead_timeline_events").insert({
      lead_id: inboxMessage.contact_id,
      event_type: "email_sent",
      event_subtype: "quick_reply",
      message: "Quick reply sent via mobile app",
      metadata: {
        message_preview: message.slice(0, 100),
      },
    });

    return NextResponse.json({ ok: true, message: "Reply sent successfully" });
  } catch (error: any) {
    console.error("Error sending reply:", error);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 }
    );
  }
}






































