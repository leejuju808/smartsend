// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/service/create
// Create a service request (warranty claim, leak report, repair request, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { homeowner_id, job_id, type, description, photos } = body;

    if (!homeowner_id || !job_id || !type || !description) {
      return NextResponse.json(
        { error: "homeowner_id, job_id, type, and description are required" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["leak", "repair", "warranty", "inspection", "other"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: leak, repair, warranty, inspection, other" },
        { status: 400 }
      );
    }

    // Get company_id from job
    let company_id = null;
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("company_id")
      .eq("id", job_id)
      .single();

    if (job?.company_id) {
      company_id = job.company_id;
    } else {
      const { data: altJob } = await supabase
        .from("jobs")
        .select("company_id")
        .eq("id", job_id)
        .single();
      if (altJob?.company_id) {
        company_id = altJob.company_id;
      }
    }

    // Create service request
    const { data: serviceRequest, error: insertError } = await supabase
      .from("service_requests")
      .insert({
        homeowner_id,
        job_id,
        company_id,
        type,
        description,
        photos: photos || [],
        status: "open",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating service request:", insertError);
      return NextResponse.json(
        { error: "Failed to create service request" },
        { status: 500 }
      );
    }

    // Create notification for customer
    await supabase.from("customer_notifications").insert({
      homeowner_id,
      job_id,
      event_type: "photos_uploaded", // Reuse event type
      title: "Service Request Submitted",
      body: `Your ${type} request has been submitted and will be reviewed by our team.`,
      read: false,
      metadata: {
        type: "service_request",
        service_request_id: serviceRequest.id,
        request_type: type,
      },
    });

    // In production, this would also create a task/notification for office staff
    // to handle the service request

    return NextResponse.json({
      ok: true,
      serviceRequest,
    });
  } catch (error: any) {
    console.error("Error in service request API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























