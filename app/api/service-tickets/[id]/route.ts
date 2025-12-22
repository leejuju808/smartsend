// Block 92000 — SmartSend Roofing Service Ticket Detail API v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get service ticket by ID
export async function GET(
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

    const { data: ticket, error } = await supabase
      .from("service_tickets")
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        ),
        warranty:warranties(
          id,
          warranty_type,
          start_date,
          end_date,
          coverage_description
        ),
        photos:service_ticket_photos(
          id,
          photo_url,
          photo_type,
          description,
          created_at
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
            foreman_name
          )
        )
      `)
      .eq("id", id)
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
    console.error("Error in GET /api/service-tickets/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH: Update service ticket
export async function PATCH(
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

    const { data: ticket, error } = await supabase
      .from("service_tickets")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        job:roofing_jobs(
          id,
          title,
          address
        ),
        warranty:warranties(
          id,
          warranty_type,
          end_date
        )
      `)
      .single();

    if (error) {
      console.error("Error updating service ticket:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update service ticket" },
        { status: 500 }
      );
    }

    // Log action if status changed
    if (body.ticket_status && body.ticket_status !== ticket.ticket_status) {
      await supabase.from("service_actions").insert({
        ticket_id: id,
        action_type: "status_change",
        description: `Status changed to ${body.ticket_status}`,
        performed_by: user.id,
      });
    }

    return NextResponse.json({ ticket }, { status: 200 });
  } catch (error: any) {
    console.error("Error in PATCH /api/service-tickets/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























