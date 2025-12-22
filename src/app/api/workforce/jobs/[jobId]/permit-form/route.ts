// Block 257200 — Auto-Generated Permit Form API
// POST /api/workforce/jobs/[jobId]/permit-form
//
// Given a job and an optional permit_type, this API:
// - Looks up city/permit requirements
// - Pulls job + lead/customer details
// - Returns a structured "permit application" payload the UI can render
//   or turn into a PDF and upload via the existing job_documents pipeline.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
    const body = await req.json().catch(() => ({}));
    const permitType = (body.permit_type as string | undefined) || "roofing";

    // Load job + lead / homeowner context
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        `
        id,
        workspace_id,
        lead_id,
        homeowner_name,
        address,
        job_type,
        status,
        estimated_value,
        final_value
      `
      )
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Attempt to infer city/state from address or lead data
    let city: string | null = null;
    let state: string | null = null;

    if (job.address) {
      // Very light parsing: assume "Street, City, ST ZIP"
      const parts = job.address.split(",");
      if (parts.length >= 2) {
        city = parts[parts.length - 2].trim();
        const stateZip = parts[parts.length - 1].trim().split(" ");
        if (stateZip.length >= 1) {
          state = stateZip[0].trim();
        }
      }
    }

    // Look up permit requirements if we have city/state
    let requirement: any = null;
    if (city && state) {
      const { data: requirements } = await supabase
        .from("city_permit_requirements")
        .select("*")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .ilike("city", city)
        .ilike("state", state)
        .eq("permit_type", permitType)
        .order("company_id", { ascending: false })
        .order("created_at", { ascending: false });

      requirement = requirements?.[0] ?? null;
    }

    const formPayload = {
      job_id: job.id,
      permit_type: permitType,
      // Basic job + homeowner info
      homeowner_name: job.homeowner_name,
      job_address: job.address,
      job_type: job.job_type,
      estimated_job_value: job.estimated_value,
      final_job_value: job.final_value,
      // Jurisdiction context
      city: city,
      state: state,
      jurisdiction: requirement?.jurisdiction || null,
      // Requirement engine details
      requirements: requirement
        ? {
            permit_required: requirement.permit_required,
            base_fee: requirement.base_fee,
            turnaround_days: requirement.turnaround_days,
            inspection_requirements: requirement.inspection_requirements,
            rules: requirement.rules,
            special_conditions: requirement.special_conditions,
          }
        : null,
      // Form sections that the UI can map into a PDF template
      sections: [
        {
          key: "applicant",
          label: "Contractor / Applicant Information",
          fields: [
            { key: "contractor_name", label: "Contractor Name", value: null },
            { key: "contractor_license", label: "License Number", value: null },
            { key: "contractor_phone", label: "Phone", value: null },
            { key: "contractor_email", label: "Email", value: null },
          ],
        },
        {
          key: "property",
          label: "Property Information",
          fields: [
            {
              key: "property_owner",
              label: "Property Owner",
              value: job.homeowner_name,
            },
            {
              key: "property_address",
              label: "Property Address",
              value: job.address,
            },
            { key: "parcel_number", label: "Parcel Number", value: null },
          ],
        },
        {
          key: "scope",
          label: "Scope of Work",
          fields: [
            { key: "scope_description", label: "Description of Work", value: null },
            {
              key: "roof_type",
              label: "Roof Type",
              value: null,
            },
            {
              key: "squares",
              label: "Squares",
              value: null,
            },
            {
              key: "material_type",
              label: "Material Type",
              value: null,
            },
            {
              key: "tear_off_or_reroof",
              label: "Tear-off or Reroof",
              value: null,
            },
          ],
        },
      ],
    };

    return NextResponse.json({
      form: formPayload,
      requirement,
    });
  } catch (error: any) {
    console.error(
      "Error in POST /api/workforce/jobs/[jobId]/permit-form:",
      error
    );
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}















