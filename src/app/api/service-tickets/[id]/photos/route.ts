import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/service-tickets/[id]/photos - Add photo to service ticket
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const ticketId = params.id;
  const body = await req.json();

  const { photo_url, label, ai_analysis, ai_suggested_cause, ai_suggested_action } = body;

  if (!photo_url) {
    return NextResponse.json(
      { error: "photo_url is required" },
      { status: 400 }
    );
  }

  try {
    // Verify ticket exists and belongs to workspace
    const { data: existingTicket, error: checkError } = await supabaseAdmin
      .from("service_tickets")
      .select("id")
      .eq("id", ticketId)
      .eq("workspace_id", workspace_id)
      .single();

    if (checkError || !existingTicket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    // Add photo
    const { data: photo, error: insertError } = await supabaseAdmin
      .from("service_photos")
      .insert({
        ticket_id: ticketId,
        photo_url,
        label: label || null,
        ai_analysis: ai_analysis || null,
        ai_suggested_cause: ai_suggested_cause || null,
        ai_suggested_action: ai_suggested_action || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error adding photo:", insertError);
      return NextResponse.json(
        { error: "Failed to add photo", details: insertError.message },
        { status: 500 }
      );
    }

    // Log event
    await supabaseAdmin
      .from("service_events")
      .insert({
        ticket_id: ticketId,
        event: "photo_added",
        metadata: { photo_id: photo.id, label },
      });

    return NextResponse.json({ photo }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[id]/photos:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































