// Block 92000 — SmartSend Roofing Service Ticket Crew Assignment API v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: Assign crew to service ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { crew_id, scheduled_date, notes } = body;

    if (!crew_id || !scheduled_date) {
      return NextResponse.json(
        { error: "crew_id and scheduled_date are required" },
        { status: 400 }
      );
    }

    // Get ticket workspace_id
    const { data: ticket } = await supabase
      .from("service_tickets")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (!ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    // Create or update assignment
    const { data: existingAssignment } = await supabase
      .from("service_assignments")
      .select("id")
      .eq("ticket_id", id)
      .single();

    let assignment;
    if (existingAssignment) {
      const { data: updated, error: updateError } = await supabase
        .from("service_assignments")
        .update({
          crew_id,
          scheduled_date,
          notes: notes || null,
          status: "scheduled",
        })
        .eq("id", existingAssignment.id)
        .select(`
          *,
          crew:crews(
            id,
            name,
            foreman_name
          )
        `)
        .single();

      if (updateError) {
        throw updateError;
      }
      assignment = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("service_assignments")
        .insert({
          ticket_id: id,
          crew_id,
          scheduled_date,
          notes: notes || null,
          status: "scheduled",
        })
        .select(`
          *,
          crew:crews(
            id,
            name,
            foreman_name
          )
        `)
        .single();

      if (createError) {
        throw createError;
      }
      assignment = created;
    }

    // Update ticket status to scheduled
    await supabase
      .from("service_tickets")
      .update({
        ticket_status: "scheduled",
        scheduled_date,
      })
      .eq("id", id);

    // Log action
    await supabase.from("service_actions").insert({
      ticket_id: id,
      action_type: "crew_assigned",
      description: `Crew assigned: ${assignment.crew?.name || crew_id} for ${scheduled_date}`,
      performed_by: user.id,
    });

    // Create calendar event for production calendar integration
    try {
      await supabase.from("calendar_events").insert({
        workspace_id: ticket.workspace_id,
        job_id: null, // Service tickets don't have job_id in calendar
        crew_id,
        event_type: "service_repair",
        title: `Service Repair - Ticket #${id.slice(0, 8)}`,
        start_time: `${scheduled_date}T08:00:00`,
        end_time: `${scheduled_date}T17:00:00`,
        description: `Service ticket repair assignment`,
      });
    } catch (calendarError) {
      console.error("Error creating calendar event:", calendarError);
      // Don't fail the request if calendar event creation fails
    }

    return NextResponse.json({ assignment }, { status: 200 });
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets/[id]/assign-crew:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























