// Block 243000 — SmartSend Roofing CX Hub
// GET /api/customer/portal/:homeowner_id
// Returns comprehensive portal data for homeowner (enhanced version)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ homeowner_id: string }> }
) {
  try {
    const { homeowner_id } = await params;

    if (!homeowner_id) {
      return NextResponse.json(
        { error: "Homeowner ID is required" },
        { status: 400 }
      );
    }

    // Get homeowner
    const { data: homeowner, error: homeownerError } = await supabase
      .from("homeowners")
      .select("*")
      .eq("id", homeowner_id)
      .single();

    if (homeownerError || !homeowner) {
      return NextResponse.json(
        { error: "Homeowner not found" },
        { status: 404 }
      );
    }

    // Get all jobs for this homeowner
    const { data: portalAccess } = await supabase
      .from("customer_portal_access")
      .select("job_id")
      .eq("homeowner_id", homeowner_id)
      .eq("is_active", true);

    if (!portalAccess || portalAccess.length === 0) {
      return NextResponse.json({
        ok: true,
        homeowner,
        jobs: [],
      });
    }

    const jobIds = portalAccess.map((pa) => pa.job_id);

    // Get all jobs
    const { data: roofingJobs } = await supabase
      .from("roofing_jobs")
      .select("*")
      .in("id", jobIds);

    const { data: jobsAlt } = await supabase
      .from("jobs")
      .select("*")
      .in("id", jobIds);

    const allJobs = [...(roofingJobs || []), ...(jobsAlt || [])];

    // For each job, get comprehensive data
    const jobsWithData = await Promise.all(
      allJobs.map(async (job) => {
        const jobId = job.id;

        // Get estimate and contract
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
        let totalPaid = 0;
        let totalDue = 0;
        try {
          const { data: jobInvoices } = await supabase
            .from("job_invoices")
            .select("*")
            .eq("job_id", jobId)
            .order("due_date", { ascending: true });

          if (jobInvoices) {
            invoices = jobInvoices;
            totalDue = jobInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount_due || inv.amount || 0)), 0);
          } else {
            const { data: altInvoices } = await supabase
              .from("invoices")
              .select("*")
              .eq("job_id", jobId)
              .order("due_date", { ascending: true });
            invoices = altInvoices || [];
            totalDue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount || 0)), 0);
          }
        } catch (e) {
          // Invoices may not exist
        }

        // Get payments
        try {
          const { data: payments } = await supabase
            .from("payments")
            .select("*")
            .eq("job_id", jobId)
            .eq("status", "completed")
            .order("created_at", { ascending: false });

          if (payments) {
            totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount || 0)), 0);
          }
        } catch (e) {
          // Payments may not exist
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
          .eq("homeowner_id", homeowner_id)
          .order("created_at", { ascending: false });

        // Get service requests
        const { data: serviceRequests } = await supabase
          .from("service_requests")
          .select("*")
          .eq("job_id", jobId)
          .eq("homeowner_id", homeowner_id)
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

        // Calculate job status stages
        const statusStages = {
          signed: contract?.status === "signed",
          scheduled: job.status === "scheduled" || schedule !== null,
          materials_ordered: false, // Would need to check supplier_orders
          materials_delivered: false, // Would need to check supplier_orders
          work_started: job.status === "in_progress" || job.stage === "in_progress",
          work_in_progress: job.status === "in_progress",
          work_completed: job.status === "completed",
          final_walkthrough: false, // Would need custom field
          paid_in_full: totalPaid >= (job.contract_value || 0),
        };

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

        return {
          ...job,
          progress,
          statusStages,
          estimate,
          contract,
          invoices,
          payments: {
            totalPaid,
            totalDue,
            remaining: totalDue - totalPaid,
          },
          photos,
          messages: messages || [],
          timeline: notifications || [],
          serviceRequests: serviceRequests || [],
          schedule,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      homeowner,
      jobs: jobsWithData,
    });
  } catch (error: any) {
    console.error("Error in portal data API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























