// POST /api/service/ticket/admin-create
// Office-created service ticket

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
      homeowner_id,
      job_id,
      warranty_id,
      ticket_type,
      description,
      priority = "normal",
      customer_name,
      customer_phone,
      customer_email,
      property_address,
      scheduled_date,
      photo_urls = [],
    } = body;

    // Validate required fields
    if (!ticket_type || !description) {
      return NextResponse.json(
        { error: "ticket_type and description are required" },
        { status: 400 }
      );
    }

    // Check if warranty is still valid
    let is_warranty_covered = false;
    if (warranty_id) {
      const { data: warranty } = await supabase
        .from("warranties")
        .select("end_date, is_active")
        .eq("id", warranty_id)
        .single();
      
      if (warranty && warranty.is_active && new Date(warranty.end_date) >= new Date()) {
        is_warranty_covered = true;
      }
    }

    // Create service ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .insert({
        workspace_id: workspaceId,
        homeowner_id: homeowner_id || null,
        job_id: job_id || null,
        warranty_id: warranty_id || null,
        ticket_type,
        description,
        priority,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        property_address: property_address || null,
        scheduled_date: scheduled_date || null,
        is_warranty_covered,
        created_by: "office",
        status: scheduled_date ? "scheduled" : "open",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating service ticket:", ticketError);
      return NextResponse.json(
        { error: ticketError.message },
        { status: 500 }
      );
    }

    // Add photo attachments if provided
    if (photo_urls.length > 0 && ticket) {
      const attachments = photo_urls.map((url: string) => ({
        ticket_id: ticket.id,
        photo_url: url,
        attachment_type: "photo",
        uploaded_by: "office",
      }));

      await supabase
        .from("service_attachments")
        .insert(attachments);
    }

    return NextResponse.json(
      { ticket },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in service/ticket/admin-create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























