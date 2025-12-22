// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Auto-create Job from Contract
// POST /api/jobs/from-contract
// Note: This is typically called automatically by the database trigger, but can be called manually if needed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { contract_id } = body;

    if (!contract_id) {
      return NextResponse.json(
        { error: "contract_id is required" },
        { status: 400 }
      );
    }

    // Get contract with all related data
    const { data: contract, error: contractError } = await supabase
      .from("estimates_contracts")
      .select(`
        *,
        proposal:estimates_proposals(
          *,
          estimate:estimates(
            *,
            company:roofing_companies(*),
            homeowner:homeowners(*)
          )
        )
      `)
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return NextResponse.json(
        { error: "Contract not found" },
        { status: 404 }
      );
    }

    // Verify contract is signed
    if (contract.status !== "signed") {
      return NextResponse.json(
        { error: "Contract must be signed before creating job" },
        { status: 400 }
      );
    }

    // Check if job link already exists
    const { data: existingLink } = await supabase
      .from("estimates_job_links")
      .select("id, job_id")
      .eq("contract_id", contract_id)
      .single();

    if (existingLink) {
      return NextResponse.json({
        ok: true,
        job_id: existingLink.job_id,
        message: "Job already created for this contract",
      });
    }

    const estimate = contract.proposal?.estimate;
    const company = estimate?.company;
    const homeowner = estimate?.homeowner;

    if (!company || !estimate) {
      return NextResponse.json(
        { error: "Missing company or estimate data" },
        { status: 400 }
      );
    }

    // Create job in roofing_jobs table
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .insert({
        workspace_id: company.workspace_id || null,
        lead_id: null, // Can be linked later if available
        title: `${homeowner?.name || 'Homeowner'} - Roof Replacement`,
        job_type: "roof_replacement",
        status: "unscheduled",
        job_value: parseFloat(estimate.total || 0),
        // Block 272600: point-of-no-return origin gate (created inside SmartSend)
        origin_source: "smartsend",
        origin_set_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating job:", jobError);
      return NextResponse.json(
        { error: "Failed to create job", details: jobError.message },
        { status: 500 }
      );
    }

    // Create job link
    const { data: jobLink, error: linkError } = await supabase
      .from("estimates_job_links")
      .insert({
        contract_id,
        job_id: job.id,
        job_table: "roofing_jobs",
        auto_created: true,
      })
      .select()
      .single();

    if (linkError) {
      console.error("Error creating job link:", linkError);
      // Job was created, so we'll still return success
    }

    return NextResponse.json({
      ok: true,
      job,
      job_link: jobLink,
      message: "Job created successfully and linked to contract",
    });
  } catch (error: any) {
    console.error("Error in /api/jobs/from-contract:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























