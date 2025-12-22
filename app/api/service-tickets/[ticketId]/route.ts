// Block 92000 — SmartSend Roofing Service Tickets v1
// API Routes for individual service ticket management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get a specific service ticket
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const supabase = createClient();
    const { ticketId } = await params;

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

    const { data: ticket, error } = await supabase
      .from("service_tickets")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address,
          status
        ),
        warranty:warranties(
          id,
          warranty_type,
          warranty_length_years,
          start_date,
          end_date,
          coverage_description,
          is_active
        ),
        photos:service_ticket_photos(
          id,
          photo_url,
          photo_type,
          description,
          created_at
        ),
        assignments:service_assignments(
          id,
          crew_id,
          scheduled_date,
          status,
          notes,
          crew:crews(
            id,
            name,
            foreman_name,
            foreman_phone
          )
        ),
        actions:service_actions(
          id,
          action_type,
          description,
          cost,
          performed_by,
          created_at,
          performed_by_user:auth.users!service_actions_performed_by_fkey(
            id,
            email
          )
        )
      `)
      .eq("id", ticketId)
      .single();

    if (error) {
      console.error("Error fetching service ticket:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch service ticket" },
        { status: 500 }
      );
    }

    if (!ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ticket }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/service-tickets/[ticketId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update a service ticket
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const supabase = createClient();
    const { ticketId } = await params;

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
    const updateData: any = {};

    if (body.ticket_status !== undefined) updateData.ticket_status = body.ticket_status;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.issue_description !== undefined) updateData.issue_description = body.issue_description;
    if (body.issue_category !== undefined) updateData.issue_category = body.issue_category;
    if (body.scheduled_date !== undefined) updateData.scheduled_date = body.scheduled_date;
    if (body.labor_cost !== undefined) updateData.labor_cost = body.labor_cost;
    if (body.material_cost !== undefined) updateData.material_cost = body.material_cost;
    if (body.charged_amount !== undefined) updateData.charged_amount = body.charged_amount;
    if (body.is_paid !== undefined) updateData.is_paid = body.is_paid;
    if (body.is_warranty_covered !== undefined) updateData.is_warranty_covered = body.is_warranty_covered;
    if (body.warranty_coverage_notes !== undefined) updateData.warranty_coverage_notes = body.warranty_coverage_notes;
    if (body.should_charge_homeowner !== undefined) updateData.should_charge_homeowner = body.should_charge_homeowner;

    const { data: ticket, error } = await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", ticketId)
      .select()
      .single();

    if (error) {
      console.error("Error updating service ticket:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update service ticket" },
        { status: 500 }
      );
    }

    // Log status change action if status changed
    if (body.ticket_status && body.ticket_status !== body.previous_status) {
      await supabase.from("service_actions").insert({
        ticket_id: ticketId,
        action_type: "status_change",
        description: `Status changed to ${body.ticket_status}`,
        performed_by: user.id,
      });
    }

    return NextResponse.json({ ticket }, { status: 200 });
  } catch (error: any) {
    console.error("Error in PATCH /api/service-tickets/[ticketId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
