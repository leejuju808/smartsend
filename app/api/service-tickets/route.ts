// Block 92000 — SmartSend Roofing Service Tickets v1
// API Routes for service ticket management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: List service tickets for a workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const jobId = searchParams.get("job_id");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");

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

    let query = supabase
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
          end_date
        ),
        photos:service_ticket_photos(
          id,
          photo_url,
          photo_type
        ),
        assignments:service_assignments(
          id,
          crew_id,
          scheduled_date,
          status,
          crew:crews(
            id,
            name
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("ticket_status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching service tickets:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch service tickets" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tickets: data || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in GET /api/service-tickets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new service ticket
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      workspace_id,
      company_id,
      job_id,
      warranty_id,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      homeowner_address,
      issue_description,
      issue_category,
      priority,
      photos,
    } = body;

    if (!workspace_id || !homeowner_name || !issue_description) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, homeowner_name, issue_description" },
        { status: 400 }
      );
    }

    // Create the ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .insert({
        workspace_id,
        company_id: company_id || null,
        job_id: job_id || null,
        warranty_id: warranty_id || null,
        homeowner_name,
        homeowner_email: homeowner_email || null,
        homeowner_phone: homeowner_phone || null,
        homeowner_address: homeowner_address || null,
        issue_description,
        issue_category: issue_category || null,
        priority: priority || "normal",
        ticket_status: "open",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating service ticket:", ticketError);
      return NextResponse.json(
        { error: ticketError.message || "Failed to create service ticket" },
        { status: 500 }
      );
    }

    // Add photos if provided
    if (photos && Array.isArray(photos) && photos.length > 0) {
      const photoInserts = photos.map((photo: any) => ({
        ticket_id: ticket.id,
        photo_url: photo.url || photo.photo_url,
        photo_type: photo.type || photo.photo_type || "other",
        description: photo.description || null,
      }));

      const { error: photosError } = await supabase
        .from("service_ticket_photos")
        .insert(photoInserts);

      if (photosError) {
        console.error("Error adding photos to ticket:", photosError);
        // Don't fail the request, just log the error
      }
    }

    // Auto-check warranty coverage if warranty_id is provided
    if (warranty_id && issue_category) {
      try {
        await supabase.rpc("check_warranty_coverage", {
          p_ticket_id: ticket.id,
          p_issue_category: issue_category,
        });
      } catch (coverageError) {
        console.error("Error checking warranty coverage:", coverageError);
        // Don't fail the request
      }
    }

    // Log initial action
    await supabase.from("service_actions").insert({
      ticket_id: ticket.id,
      action_type: "notes",
      description: `Service ticket created: ${issue_description}`,
    });

    // Fetch the complete ticket with relations
    const { data: completeTicket, error: fetchError } = await supabase
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
          end_date
        ),
        photos:service_ticket_photos(
          id,
          photo_url,
          photo_type
        )
      `)
      .eq("id", ticket.id)
      .single();

    return NextResponse.json(
      { ticket: completeTicket || ticket },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in POST /api/service-tickets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
