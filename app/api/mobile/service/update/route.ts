// Block 238000 — SmartSend Mobile App v1
// POST /api/mobile/service/update
// Update service ticket from mobile app

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
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
    const {
      ticket_id,
      status, // 'open', 'assigned', 'in_progress', 'completed', 'closed'
      notes,
      photos, // Array of photo URLs
      resolution_notes,
      labor_hours,
      material_cost,
      total_cost,
    } = body;

    if (!ticket_id) {
      return NextResponse.json(
        { error: "ticket_id is required" },
        { status: 400 }
      );
    }

    // Get existing ticket
    const { data: ticket, error: fetchError } = await supabase
      .from("service_tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (fetchError || !ticket) {
      return NextResponse.json(
        { error: "Service ticket not found" },
        { status: 404 }
      );
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (notes) updates.notes = notes;
    if (resolution_notes) updates.resolution_notes = resolution_notes;
    if (labor_hours !== undefined) updates.labor_hours = labor_hours;
    if (material_cost !== undefined) updates.material_cost = material_cost;
    if (total_cost !== undefined) updates.total_cost = total_cost;

    // If status is completed, set completed_at
    if (status === "completed" || status === "closed") {
      updates.completed_at = new Date().toISOString();
    }

    // Update ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from("service_tickets")
      .update(updates)
      .eq("id", ticket_id)
      .select()
      .single();

    if (updateError) {
      console.error("Service ticket update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update service ticket", details: updateError.message },
        { status: 500 }
      );
    }

    // If photos provided, add them to job_media
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const photoRecords = photos.map((photoUrl: string) => ({
        job_id: ticket.job_id,
        user_id: user.id,
        url: photoUrl,
        media_type: "photo",
        notes: `Service ticket ${ticket_id}`,
      }));

      await supabase.from("job_media").insert(photoRecords);
    }

    // If status changed to completed, notify relevant parties
    if (status === "completed" && ticket.status !== "completed") {
      // Create notification or alert
      await supabase.from("notifications").insert({
        user_id: ticket.homeowner_id || ticket.lead_id,
        type: "service_completed",
        title: "Service Completed",
        message: `Service ticket ${ticket.ticket_number || ticket_id} has been completed`,
        data: { ticket_id: ticket_id },
      });
    }

    return NextResponse.json({
      success: true,
      ticket: updatedTicket,
    });
  } catch (error: any) {
    console.error("Error in service update API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/mobile/service/update?ticket_id=xxx
// Get service ticket details
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const url = new URL(req.url);
    const ticketId = url.searchParams.get("ticket_id");

    if (!ticketId) {
      return NextResponse.json(
        { error: "ticket_id is required" },
        { status: 400 }
      );
    }

    const { data: ticket, error } = await supabase
      .from("service_tickets")
      .select(`
        *,
        jobs:job_id (
          id,
          stage,
          leads:lead_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            address
          )
        )
      `)
      .eq("id", ticketId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error("Error fetching service ticket:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























