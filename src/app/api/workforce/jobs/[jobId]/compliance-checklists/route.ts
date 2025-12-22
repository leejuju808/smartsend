// Block 257200 — Compliance Checklists API
// GET  /api/workforce/jobs/[jobId]/compliance-checklists - List checklists by phase
// POST /api/workforce/jobs/[jobId]/compliance-checklists - Create or update a checklist
//
// This powers:
// - Pre-Install: permit posted, materials match permit, HOA approval
// - Install: drip edge, ice & water, underlayment, ventilation
// - Post-Install: inspection card uploaded, homeowner sign-off

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

type Phase = "pre_install" | "install" | "post_install";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;
    const url = new URL(req.url);
    const phase = url.searchParams.get("phase") as Phase | null;

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

    let query = supabase
      .from("compliance_checklists")
      .select("*")
      .eq("job_id", jobId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (phase) {
      query = query.eq("phase", phase);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching compliance checklists:", error);
      return NextResponse.json(
        { error: "Failed to fetch compliance checklists" },
        { status: 500 }
      );
    }

    return NextResponse.json({ checklists: data || [] });
  } catch (error: any) {
    console.error(
      "Error in GET /api/workforce/jobs/[jobId]/compliance-checklists:",
      error
    );
    return NextResponse.json(
      { error: error.message || "Internal server error" },
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;
    const body = await req.json();

    const {
      id,
      phase,
      checklist,
      completed,
      completed_at,
    }: {
      id?: string;
      phase: Phase;
      checklist: any;
      completed?: boolean;
      completed_at?: string | null;
    } = body;

    if (!phase || !checklist) {
      return NextResponse.json(
        { error: "phase and checklist are required" },
        { status: 400 }
      );
    }

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

    // Find workforce employee for created_by
    let createdBy: string | null = null;
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();

    if (employee?.id) {
      createdBy = employee.id;
    }

    let result;
    if (id) {
      const { data, error } = await supabase
        .from("compliance_checklists")
        .update({
          phase,
          checklist,
          completed: typeof completed === "boolean" ? completed : null,
          completed_at: completed_at || (completed ? new Date().toISOString() : null),
        })
        .eq("id", id)
        .eq("job_id", jobId)
        .eq("company_id", companyId)
        .select("*")
        .single();

      if (error) {
        console.error("Error updating compliance checklist:", error);
        return NextResponse.json(
          { error: "Failed to update compliance checklist" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      const { data, error } = await supabase
        .from("compliance_checklists")
        .insert({
          job_id: jobId,
          company_id: companyId,
          phase,
          checklist,
          completed: typeof completed === "boolean" ? completed : false,
          completed_at:
            completed && !completed_at
              ? new Date().toISOString()
              : completed_at || null,
          created_by: createdBy,
        })
        .select("*")
        .single();

      if (error) {
        console.error("Error creating compliance checklist:", error);
        return NextResponse.json(
          { error: "Failed to create compliance checklist" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ checklist: result });
  } catch (error: any) {
    console.error(
      "Error in POST /api/workforce/jobs/[jobId]/compliance-checklists:",
      error
    );
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}















