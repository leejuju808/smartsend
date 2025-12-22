import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/inbox/[id]/mark-not-interested
 * Mark a lead as not interested
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = createClient();

    // Get the inbox message and contact
    const { data: message, error: msgError } = await supabase
      .from("inbox_messages")
      .select("contact_id")
      .eq("id", params.id)
      .single();

    if (msgError || !message) {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    // Update contact status to "lost" or "not_interested"
    const { error: updateError } = await supabase
      .from("contacts")
      .update({ lead_status: "lost" })
      .eq("id", message.contact_id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update contact status" },
        { status: 500 }
      );
    }

    // Create timeline event
    await supabase.from("lead_timeline_events").insert({
      lead_id: message.contact_id,
      event_type: "status_changed",
      event_subtype: "manual_status_change",
      message: "Marked as not interested via mobile app",
      metadata: {
        old_status: null,
        new_status: "lost",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error marking as not interested:", error);
    return NextResponse.json(
      { error: "Failed to mark as not interested" },
      { status: 500 }
    );
  }
}






































