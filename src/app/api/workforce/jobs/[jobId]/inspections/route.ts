// GET /api/workforce/jobs/[jobId]/inspections - List inspection reports
// POST /api/workforce/jobs/[jobId]/inspections - Create inspection report

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

    // Get inspection reports
    const { data: inspections, error } = await supabase
      .from("inspection_reports")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching inspections:", error);
      return NextResponse.json(
        { error: "Failed to fetch inspections" },
        { status: 500 }
      );
    }

    return NextResponse.json({ inspections: inspections || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/inspections:", error);
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

    // Get employee ID
    let employeeId = null;
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .single();
    
    employeeId = employee?.id || null;

    // Create inspection report
    const { data: inspection, error } = await supabase
      .from("inspection_reports")
      .insert({
        job_id: jobId,
        company_id: companyId,
        inspector_name: body.inspector_name || null,
        inspector_type: body.inspector_type || null,
        report_url: body.report_url || null,
        passed: body.passed ?? null,
        status: body.status || "scheduled",
        inspection_date: body.inspection_date || null,
        notes: body.notes || null,
        deficiencies: body.deficiencies || null,
        created_by: employeeId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating inspection:", error);
      return NextResponse.json(
        { error: "Failed to create inspection report" },
        { status: 500 }
      );
    }

    return NextResponse.json({ inspection });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/inspections:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























