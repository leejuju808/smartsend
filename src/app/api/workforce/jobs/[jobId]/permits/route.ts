// GET /api/workforce/jobs/[jobId]/permits - List permits
// POST /api/workforce/jobs/[jobId]/permits - Create permit

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

    // Get permits
    const { data: permits, error } = await supabase
      .from("permits")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching permits:", error);
      return NextResponse.json(
        { error: "Failed to fetch permits" },
        { status: 500 }
      );
    }

    return NextResponse.json({ permits: permits || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/permits:", error);
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

    // Create permit
    const { data: permit, error } = await supabase
      .from("permits")
      .insert({
        job_id: jobId,
        company_id: companyId,
        permit_number: body.permit_number || null,
        issued_by: body.issued_by || null,
        permit_type: body.permit_type || null,
        status: body.status || "pending",
        applied_date: body.applied_date || null,
        issued_date: body.issued_date || null,
        expires_on: body.expires_on || null,
        file_url: body.file_url || null,
        city_contact_name: body.city_contact_name || null,
        city_contact_phone: body.city_contact_phone || null,
        city_contact_email: body.city_contact_email || null,
        notes: body.notes || null,
        created_by: employeeId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating permit:", error);
      return NextResponse.json(
        { error: "Failed to create permit" },
        { status: 500 }
      );
    }

    return NextResponse.json({ permit });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/permits:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























