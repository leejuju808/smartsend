import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/service-tickets/[id] - Get service ticket detail
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const ticketId = params.id;

  try {
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("service_tickets")
      .select(
        `
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        jobs:job_id (
          id,
          stage,
          contract_value,
          created_at
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

    // Get photos
    const { data: photos } = await supabaseAdmin
      .from("service_photos")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    // Get events
    const { data: events } = await supabaseAdmin
      .from("service_events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ticket,
      photos: photos || [],
      events: events || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/service-tickets/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT /api/service-tickets/[id] - Update service ticket
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const { workspace_id } = gate;
  const ticketId = params.id;
  const body = await req.json();

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

    // Update ticket
    const updateData: any = {};
    
    if (body.status !== undefined) updateData.status = body.status;
    if (body.urgency !== undefined) updateData.urgency = body.urgency;
    if (body.issue_type !== undefined) updateData.issue_type = body.issue_type;
    if (body.covered !== undefined) updateData.covered = body.covered;
    if (body.warranty_determination !== undefined) updateData.warranty_determination = body.warranty_determination;
    if (body.recommended_action !== undefined) updateData.recommended_action = body.recommended_action;
    if (body.estimated_labor_hours !== undefined) updateData.estimated_labor_hours = body.estimated_labor_hours;
    if (body.crew_assigned_id !== undefined) updateData.crew_assigned_id = body.crew_assigned_id;
    if (body.crew_assigned_name !== undefined) updateData.crew_assigned_name = body.crew_assigned_name;
    if (body.scheduled_at !== undefined) updateData.scheduled_at = body.scheduled_at;
    if (body.resolved_at !== undefined) updateData.resolved_at = body.resolved_at;
    if (body.abuse_flag !== undefined) updateData.abuse_flag = body.abuse_flag;
    if (body.abuse_reason !== undefined) updateData.abuse_reason = body.abuse_reason;

    const { data: ticket, error: updateError } = await supabaseAdmin
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticketId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating service ticket:", updateError);
      return NextResponse.json(
        { error: "Failed to update service ticket", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ticket });
  } catch (error: any) {
    console.error("Error in PUT /api/service-tickets/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































