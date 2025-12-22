// POST /api/service/ticket/create
// Customer-submitted service request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public endpoint - customer can submit without auth
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

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
      requested_date,
      photo_urls = [], // Array of photo URLs
    } = body;

    // Validate required fields
    if (!ticket_type || !description) {
      return NextResponse.json(
        { error: "ticket_type and description are required" },
        { status: 400 }
      );
    }

    // Get workspace_id from job or homeowner
    let workspaceId: string | null = null;
    
    if (job_id) {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("workspace_id")
        .eq("id", job_id)
        .single();
      
      if (job) workspaceId = job.workspace_id;
    } else if (homeowner_id) {
      const { data: homeowner } = await supabase
        .from("homeowners")
        .select("job_id")
        .eq("id", homeowner_id)
        .single();
      
      if (homeowner?.job_id) {
        const { data: job } = await supabase
          .from("roofing_jobs")
          .select("workspace_id")
          .eq("id", homeowner.job_id)
          .single();
        
        if (job) workspaceId = job.workspace_id;
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Could not determine workspace from job_id or homeowner_id" },
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
        requested_date: requested_date || null,
        is_warranty_covered,
        created_by: "customer",
        status: "open",
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
        uploaded_by: "customer",
      }));

      await supabase
        .from("service_attachments")
        .insert(attachments);
    }

    // TODO: Send notification to office about new service ticket

    return NextResponse.json(
      { 
        ticket,
        message: "Service request submitted successfully. We'll contact you soon." 
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in service/ticket/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























