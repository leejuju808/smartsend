import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/inbox/[id]/notes
 * Save a note to a lead profile
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { note, source } = await req.json();

    if (!note) {
      return NextResponse.json(
        { error: "Note text required" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get the inbox message to find contact_id
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

    // Create timeline event with note
    const { error: timelineError } = await supabase
      .from("lead_timeline_events")
      .insert({
        lead_id: message.contact_id,
        event_type: "note",
        event_subtype: source || "manual",
        message: note,
        metadata: {
          source: source || "mobile_app",
        },
      });

    if (timelineError) {
      return NextResponse.json(
        { error: "Failed to save note" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Note saved successfully" });
  } catch (error: any) {
    console.error("Error saving note:", error);
    return NextResponse.json(
      { error: "Failed to save note" },
      { status: 500 }
    );
  }
}






































