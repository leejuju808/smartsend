// GET /api/workforce/jobs/[jobId]/subs - List subs assigned to job
// POST /api/workforce/jobs/[jobId]/subs - Assign sub to job

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

    // Get assignments with subcontractor details
    const { data, error } = await supabase
      .from("sub_job_assignments")
      .select(`
        *,
        subcontractors:sub_id (
          id,
          name,
          contact_name,
          phone,
          email,
          trade,
          status
        )
      `)
      .eq("job_id", jobId)
      .order("assigned_at", { ascending: false });

    if (error) {
      console.error("Error fetching assignments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignments: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/subs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const { sub_id, role, notes } = body;

    if (!sub_id) {
      return NextResponse.json({ error: "sub_id is required" }, { status: 400 });
    }

    // Verify subcontractor belongs to company
    const { data: sub } = await supabase
      .from("subcontractors")
      .select("id, status")
      .eq("id", sub_id)
      .eq("company_id", companyId)
      .single();

    if (!sub) {
      return NextResponse.json({ error: "Subcontractor not found" }, { status: 404 });
    }

    // Check if sub is compliant (has required docs)
    const { data: docs } = await supabase
      .from("subcontractor_documents")
      .select("doc_type, expires_at")
      .eq("sub_id", sub_id);

    const hasW9 = docs?.some((d) => d.doc_type === "W9");
    const hasCOI = docs?.some(
      (d) => d.doc_type === "COI" && (!d.expires_at || new Date(d.expires_at) >= new Date())
    );
    const hasLicense = docs?.some((d) => d.doc_type === "License");

    if (!hasW9 || !hasCOI || !hasLicense) {
      return NextResponse.json(
        {
          error: "Subcontractor is missing required documents (W9, COI, or License)",
          compliance_status: "incomplete",
        },
        { status: 400 }
      );
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from("sub_job_assignments")
      .select("id")
      .eq("job_id", jobId)
      .eq("sub_id", sub_id)
      .eq("status", "assigned")
      .single();

    if (existing) {
      return NextResponse.json({ error: "Subcontractor already assigned to this job" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("sub_job_assignments")
      .insert({
        job_id: jobId,
        sub_id,
        role: role || null,
        notes: notes || null,
        assigned_by: user.id,
        status: "assigned",
      })
      .select(`
        *,
        subcontractors:sub_id (
          id,
          name,
          contact_name,
          phone,
          email,
          trade
        )
      `)
      .single();

    if (error) {
      console.error("Error creating assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // TODO: Send SMS to sub with job details (future enhancement)

    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/subs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























