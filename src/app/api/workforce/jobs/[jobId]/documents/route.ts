// GET /api/workforce/jobs/[jobId]/documents - List documents for a job
// POST /api/workforce/jobs/[jobId]/documents - Create document record

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("job_documents")
      .select(`
        *,
        workforce_employees:uploaded_by (
          first_name,
          last_name
        )
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("doc_type", type);
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error("Error fetching documents:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: documents || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/documents:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;
    const body = await req.json();

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Get employee ID for uploaded_by
    let employeeId = null;
    if (body.uploaded_by_employee_id) {
      employeeId = body.uploaded_by_employee_id;
    } else {
      // Try to find employee by user_id
      const { data: employee } = await supabase
        .from("workforce_employees")
        .select("id")
        .eq("company_id", companyId)
        .limit(1)
        .single();
      
      employeeId = employee?.id || null;
    }

    // Create document record
    const { data: document, error } = await supabase
      .from("job_documents")
      .insert({
        job_id: jobId,
        company_id: companyId,
        doc_type: body.doc_type,
        name: body.name,
        file_url: body.file_url,
        storage_path: body.storage_path || null,
        file_size: body.file_size || null,
        mime_type: body.mime_type || null,
        photo_category: body.photo_category || null,
        description: body.description || null,
        uploaded_by: employeeId,
      })
      .select(`
        *,
        workforce_employees:uploaded_by (
          first_name,
          last_name
        )
      `)
      .single();

    if (error) {
      console.error("Error creating document:", error);
      return NextResponse.json(
        { error: "Failed to create document" },
        { status: 500 }
      );
    }

    return NextResponse.json({ document });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/documents:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























