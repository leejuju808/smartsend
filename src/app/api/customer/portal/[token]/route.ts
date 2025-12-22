// Block 227000 — SmartSend Roofing Customer Portal
// GET /api/customer/portal/:token
// Returns all data for the customer portal (public access via token)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Validate token and get portal access
    const { data: access, error: accessError } = await supabase
      .from("customer_portal_access")
      .select("*, homeowner:homeowners(*), job_id")
      .eq("access_token", token)
      .eq("is_active", true)
      .single();

    if (accessError || !access) {
      return NextResponse.json(
        { error: "Invalid or expired portal access token" },
        { status: 401 }
      );
    }

    // Check expiration
    if (access.expires_at && new Date(access.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Portal access has expired" },
        { status: 401 }
      );
    }

    // Update last login
    await supabase
      .from("customer_portal_access")
      .update({ last_login: new Date().toISOString() })
      .eq("id", access.id);

    const jobId = access.job_id;

    // Get job details (try roofing_jobs first, then jobs)
    let job: any = null;
    const { data: roofingJob } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (roofingJob) {
      job = roofingJob;
    } else {
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();
      job = jobAlt;
    }

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get homeowner details
    const homeowner = access.homeowner || null;

    // Get estimate (if linked via contract)
    let estimate = null;
    let contract = null;
    try {
      const { data: jobLink } = await supabase
        .from("estimates_job_links")
        .select("contract_id, contract:estimates_contracts(*, proposal:estimates_proposals(*, estimate:estimates(*)))")
        .eq("job_id", jobId)
        .single();

      if (jobLink?.contract) {
        contract = jobLink.contract;
        if (contract.proposal?.estimate) {
          estimate = contract.proposal.estimate;
        }
      }
    } catch (e) {
      // Estimates/contracts may not exist
    }

    // Get invoices/payment schedule
    let invoices: any[] = [];
    try {
      const { data: jobInvoices } = await supabase
        .from("job_invoices")
        .select("*")
        .eq("job_id", jobId)
        .order("due_date", { ascending: true });

      if (jobInvoices) {
        invoices = jobInvoices;
      } else {
        // Try alternative invoices table
        const { data: altInvoices } = await supabase
          .from("invoices")
          .select("*")
          .eq("job_id", jobId)
          .order("due_date", { ascending: true });
        invoices = altInvoices || [];
      }
    } catch (e) {
      // Invoices may not exist
    }

    // Get photos (before, during, after)
    let photos: any[] = [];
    try {
      const { data: crewPhotos } = await supabase
        .from("crew_photos")
        .select("id, photo_url, category, notes, created_at")
        .eq("job_id", jobId)
        .in("category", ["before", "during", "after"])
        .order("created_at", { ascending: false });

      if (crewPhotos) {
        photos = crewPhotos;
      } else {
        // Try job_photos table
        const { data: jobPhotos } = await supabase
          .from("job_photos")
          .select("id, url, category, created_at")
          .eq("job_id", jobId)
          .in("category", ["before", "during", "after"])
          .order("created_at", { ascending: false });
        photos = jobPhotos || [];
      }
    } catch (e) {
      // Photos may not exist
    }

    // Get messages
    const { data: messages } = await supabase
      .from("customer_messages")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    // Get notifications/timeline
    const { data: notifications } = await supabase
      .from("customer_notifications")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get production schedule
    let schedule = null;
    try {
      const { data: productionSlot } = await supabase
        .from("job_production_slots")
        .select("*, crew:crews(name)")
        .eq("job_id", jobId)
        .order("start_date", { ascending: true })
        .limit(1)
        .single();
      schedule = productionSlot;
    } catch (e) {
      // Schedule may not exist
    }

    // Calculate progress percentage
    let progress = 0;
    if (job.status === "completed") {
      progress = 100;
    } else if (job.status === "in_progress") {
      progress = job.progress || 50;
    } else if (job.status === "scheduled") {
      progress = 25;
    } else if (contract?.status === "signed") {
      progress = 10;
    }

    // Determine next milestone
    let nextMilestone = null;
    if (!contract || contract.status !== "signed") {
      nextMilestone = "Contract signing";
    } else if (invoices.length > 0 && invoices[0].status !== "paid") {
      nextMilestone = `Payment: $${invoices[0].amount_due || invoices[0].amount}`;
    } else if (schedule && schedule.start_date) {
      nextMilestone = `Crew scheduled: ${new Date(schedule.start_date).toLocaleDateString()}`;
    } else if (job.status === "scheduled") {
      nextMilestone = "Awaiting crew assignment";
    } else if (job.status === "in_progress") {
      nextMilestone = "Work in progress";
    } else if (job.status === "completed") {
      nextMilestone = "Project complete!";
    }

    return NextResponse.json({
      ok: true,
      homeowner,
      job: {
        ...job,
        progress,
        nextMilestone,
      },
      estimate,
      contract,
      invoices,
      photos,
      messages: messages || [],
      timeline: notifications || [],
      schedule,
    });
  } catch (error: any) {
    console.error("Error in portal data API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























