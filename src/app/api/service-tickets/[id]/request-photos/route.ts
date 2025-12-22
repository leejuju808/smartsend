import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/service-tickets/[id]/request-photos - Request photos from homeowner
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const ticketId = params.id;
  const body = await req.json();

  const { custom_message } = body;

  try {
    // Get ticket with lead info
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("service_tickets")
      .select(
        `
        id,
        lead_id,
        workspace_id,
        leads:lead_id (
          id,
          phone,
          first_name,
          last_name
        )
        `
      )
      .eq("id", ticketId)
      .eq("workspace_id", workspace_id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    if (!ticket.lead_id) {
      return NextResponse.json(
        { error: "Service ticket has no associated lead" },
        { status: 400 }
      );
    }

    const lead = ticket.leads as any;
    if (!lead?.phone) {
      return NextResponse.json(
        { error: "Lead has no phone number" },
        { status: 400 }
      );
    }

    // Call edge function to send SMS
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-service-photos`;
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        ticket_id: ticketId,
        lead_id: ticket.lead_id,
        workspace_id: workspace_id,
        custom_message,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: "Failed to send photo request", details: error.error },
        { status: 500 }
      );
    }

    const result = await response.json();

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[id]/request-photos:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































