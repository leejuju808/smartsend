// Block 22350 — SmartSend Roofing Job Closeout Package v1
// API Route: Build Closeout Data
// GET /api/job-closeout/[jobId]/build
// Assembles ALL DATA needed for the closeout package

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { jobId } = await ctx.params;

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Ensure user is authenticated
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

    // 1. Job core data with related info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
        lead:leads(
          id,
          first_name,
          last_name,
          address,
          city,
          state,
          zip,
          phone,
          email
        )
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // 2. Before & After Photos
    const { data: photos } = await supabase
      .from("job_documents")
      .select("*")
      .eq("job_id", jobId)
      .in("doc_type", ["photo_before", "photo_after"]);

    const before = (photos || []).filter(
      (p: any) => p.doc_type === "photo_before"
    );
    const after = (photos || []).filter(
      (p: any) => p.doc_type === "photo_after"
    );

    // Generate signed URLs for photos (valid for 1 hour)
    const beforeWithUrls = await Promise.all(
      before.map(async (p: any) => {
        if (!p.file_url) return { ...p, file_url: null };
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(p.file_url, 3600);
        return {
          ...p,
          file_url: urlData?.signedUrl || null,
        };
      })
    );

    const afterWithUrls = await Promise.all(
      after.map(async (p: any) => {
        if (!p.file_url) return { ...p, file_url: null };
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(p.file_url, 3600);
        return {
          ...p,
          file_url: urlData?.signedUrl || null,
        };
      })
    );

    // 3. Contract & Invoices
    const { data: contractDocs } = await supabase
      .from("job_documents")
      .select("*")
      .eq("job_id", jobId)
      .eq("doc_type", "contract");

    const { data: invoiceDocs } = await supabase
      .from("job_documents")
      .select("*")
      .eq("job_id", jobId)
      .eq("doc_type", "invoice");

    // Generate signed URLs for contracts and invoices
    const contractWithUrls = await Promise.all(
      (contractDocs || []).map(async (doc: any) => {
        if (!doc.file_url) return { ...doc, file_url: null };
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(doc.file_url, 3600);
        return {
          ...doc,
          file_url: urlData?.signedUrl || null,
        };
      })
    );

    const invoiceWithUrls = await Promise.all(
      (invoiceDocs || []).map(async (doc: any) => {
        if (!doc.file_url) return { ...doc, file_url: null };
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(doc.file_url, 3600);
        return {
          ...doc,
          file_url: urlData?.signedUrl || null,
        };
      })
    );

    // 4. Payment history
    const { data: payments } = await supabase
      .from("job_payments")
      .select("*")
      .eq("job_id", jobId)
      .order("received_at", { ascending: true });

    // 5. Permit documents
    const { data: permits } = await supabase
      .from("job_documents")
      .select("*")
      .eq("job_id", jobId)
      .eq("doc_type", "permit");

    // Generate signed URLs for permits
    const permitsWithUrls = await Promise.all(
      (permits || []).map(async (doc: any) => {
        if (!doc.file_url) return { ...doc, file_url: null };
        const { data: urlData } = await supabase.storage
          .from("job-documents")
          .createSignedUrl(doc.file_url, 3600);
        return {
          ...doc,
          file_url: urlData?.signedUrl || null,
        };
      })
    );

    // 6. Material orders with items
    const { data: materialOrders } = await supabase
      .from("material_orders")
      .select(`
        *,
        items:material_order_items(*)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    // 7. Crew assignments
    const { data: crewAssignments } = await supabase
      .from("job_crew_assignments")
      .select(`
        *,
        crew:crews(name)
      `)
      .eq("job_id", jobId)
      .is("unassigned_at", null);

    // 8. Notes (from job fields)
    const crewNotes = job.safety_notes || null;
    const homeownerNotes = job.homeowner_notes || null;

    // Calculate total paid from payments
    const totalPaid = (payments || [])
      .filter((p: any) => p.status === "received")
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

    return NextResponse.json(
      {
        job: {
          ...job,
          revenue_collected: totalPaid, // Use calculated total from payments
        },
        lead: job.lead,
        before: beforeWithUrls,
        after: afterWithUrls,
        contract: contractWithUrls[0] || null,
        invoices: invoiceWithUrls,
        materials: materialOrders || [],
        payments: payments || [],
        permits: permitsWithUrls,
        crewNotes,
        homeownerNotes,
        crewAssignments: crewAssignments || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error building closeout data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































