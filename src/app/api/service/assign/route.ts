// POST /api/service/assign
// Assign service crew to ticket

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      ticket_id,
      crew_id,
      assigned_to_user_id,
      scheduled_date,
      scheduled_time,
      notes,
    } = body;

    // Validate required fields
    if (!ticket_id || !scheduled_date) {
      return NextResponse.json(
        { error: "ticket_id and scheduled_date are required" },
        { status: 400 }
      );
    }

    if (!crew_id && !assigned_to_user_id) {
      return NextResponse.json(
        { error: "Either crew_id or assigned_to_user_id is required" },
        { status: 400 }
      );
    }

    // Verify ticket exists and belongs to workspace
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .select("id, workspace_id, status")
      .eq("id", ticket_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    // Create assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("service_assignments")
      .insert({
        ticket_id,
        crew_id: crew_id || null,
        assigned_to_user_id: assigned_to_user_id || null,
        scheduled_date,
        scheduled_time: scheduled_time || null,
        notes: notes || null,
        status: "scheduled",
      })
      .select()
      .single();

    if (assignmentError) {
      console.error("Error creating assignment:", assignmentError);
      return NextResponse.json(
        { error: assignmentError.message },
        { status: 500 }
      );
    }

    // Update ticket status and scheduled date
    await supabase
      .from("service_tickets")
      .update({
        status: "scheduled",
        scheduled_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticket_id);

    // TODO: Send notification to crew
    // TODO: Send notification to customer

    return NextResponse.json(
      { assignment },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in service/assign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























