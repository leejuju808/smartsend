// Block 22350 — SmartSend Roofing Job Closeout Package v1
// API Route: Public Closeout Endpoint
// GET /api/public-closeout/[token]
// Maps token → job → closeout data (public access, no auth required)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;

    if (!token) {
      return NextResponse.json(
        { error: "token parameter is required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Use service role client to access job data (token provides security)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Look up job by closeout token
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id")
      .eq("closeout_token", token)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 404 }
      );
    }

    // Build data directly using service role (public endpoint doesn't need auth)
    const { data: jobData, error: jobDataError } = await supabase
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
        .eq("id", job.id)
        .single();

    if (jobDataError || !jobData) {
      return NextResponse.json(
        { error: "Job data not found" },
        { status: 404 }
      );
    }

    // Get all related data
    const [photos, contractDocs, invoiceDocs, payments, permits, materialOrders, crewAssignments] = await Promise.all([
        supabase
          .from("job_documents")
          .select("*")
          .eq("job_id", job.id)
          .in("doc_type", ["photo_before", "photo_after"]),
        supabase
          .from("job_documents")
          .select("*")
          .eq("job_id", job.id)
          .eq("doc_type", "contract"),
        supabase
          .from("job_documents")
          .select("*")
          .eq("job_id", job.id)
          .eq("doc_type", "invoice"),
        supabase
          .from("job_payments")
          .select("*")
          .eq("job_id", job.id)
          .order("received_at", { ascending: true }),
        supabase
          .from("job_documents")
          .select("*")
          .eq("job_id", job.id)
          .eq("doc_type", "permit"),
        supabase
          .from("material_orders")
          .select(`
            *,
            items:material_order_items(*)
          `)
          .eq("job_id", job.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("job_crew_assignments")
          .select(`
            *,
            crew:crews(name)
          `)
          .eq("job_id", job.id)
          .is("unassigned_at", null),
    ]);

    // Generate signed URLs for all documents
    const generateSignedUrl = async (fileUrl: string | null) => {
      if (!fileUrl) return null;
      const { data: urlData } = await supabase.storage
        .from("job-documents")
        .createSignedUrl(fileUrl, 3600);
      return urlData?.signedUrl || null;
    };

    const before = (photos.data || [])
      .filter((p: any) => p.doc_type === "photo_before")
      .map(async (p: any) => ({
        ...p,
        file_url: await generateSignedUrl(p.file_url),
      }));

    const after = (photos.data || [])
      .filter((p: any) => p.doc_type === "photo_after")
      .map(async (p: any) => ({
        ...p,
        file_url: await generateSignedUrl(p.file_url),
      }));

    const contractWithUrls = await Promise.all(
      (contractDocs.data || []).map(async (doc: any) => ({
        ...doc,
        file_url: await generateSignedUrl(doc.file_url),
      }))
    );

    const invoiceWithUrls = await Promise.all(
      (invoiceDocs.data || []).map(async (doc: any) => ({
        ...doc,
        file_url: await generateSignedUrl(doc.file_url),
      }))
    );

    const permitsWithUrls = await Promise.all(
      (permits.data || []).map(async (doc: any) => ({
        ...doc,
        file_url: await generateSignedUrl(doc.file_url),
      }))
    );

    const beforeWithUrls = await Promise.all(before);
    const afterWithUrls = await Promise.all(after);

    const totalPaid = (payments.data || [])
      .filter((p: any) => p.status === "received")
      .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

    return NextResponse.json(
      {
        job: {
          ...jobData,
          revenue_collected: totalPaid,
        },
        lead: jobData.lead,
        before: beforeWithUrls,
        after: afterWithUrls,
        contract: contractWithUrls[0] || null,
        invoices: invoiceWithUrls,
        materials: materialOrders.data || [],
        payments: payments.data || [],
        permits: permitsWithUrls,
        crewNotes: jobData.safety_notes || null,
        homeownerNotes: jobData.homeowner_notes || null,
        crewAssignments: crewAssignments.data || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error fetching public closeout:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

