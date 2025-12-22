import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/service-tickets/[id]/schedule - Schedule repair crew
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const ticketId = params.id;
  const body = await req.json();

  const { time_slot, crew_id, crew_name } = body;

  if (!time_slot) {
    return NextResponse.json(
      { error: "time_slot is required" },
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

    // Parse time_slot
    const scheduledAt = new Date(time_slot);
    if (isNaN(scheduledAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid time_slot format" },
        { status: 400 }
      );
    }

    // Update ticket
    const updateData: any = {
      scheduled_at: scheduledAt.toISOString(),
      status: "scheduled",
    };

    if (crew_id) {
      updateData.crew_assigned_id = crew_id;
    }

    if (crew_name) {
      updateData.crew_assigned_name = crew_name;
    }

    const { data: ticket, error: updateError } = await supabaseAdmin
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticketId)
      .select()
      .single();

    if (updateError) {
      console.error("Error scheduling repair:", updateError);
      return NextResponse.json(
        { error: "Failed to schedule repair", details: updateError.message },
        { status: 500 }
      );
    }

    // Log event
    await supabaseAdmin
      .from("service_events")
      .insert({
        ticket_id: ticketId,
        event: "scheduled",
        metadata: {
          scheduled_at: scheduledAt.toISOString(),
          crew_id: crew_id || null,
          crew_name: crew_name || null,
        },
      });

    // Call edge function to notify if needed
    try {
      const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/schedule-repair-crew`;
      await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          time_slot: scheduledAt.toISOString(),
          crew_id,
          crew_name,
        }),
      });
    } catch (edgeError) {
      console.error("Error calling schedule-repair-crew edge function:", edgeError);
      // Don't fail the request if edge function fails
    }

    return NextResponse.json({ ticket });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[id]/schedule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































