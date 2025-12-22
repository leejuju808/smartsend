// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// API Route: Create financing application

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    // Allow unauthenticated requests for public application flow
    // but prefer authenticated if available

    const {
      lead_id,
      job_id,
      proposal_id,
      workspace_id,
      amount_requested,
      financing_provider,
      application_data, // Name, address, SSN last 4, income range, etc.
    } = await req.json();

    if (!amount_requested || !financing_provider) {
      return NextResponse.json(
        { error: "amount_requested and financing_provider are required" },
        { status: 400 }
      );
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      if (lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", lead_id)
          .single();
        if (lead) finalWorkspaceId = lead.workspace_id;
      } else if (job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("workspace_id")
          .eq("id", job_id)
          .single();
        if (job) finalWorkspaceId = job.workspace_id;
      } else if (proposal_id) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("workspace_id")
          .eq("id", proposal_id)
          .single();
        if (proposal) finalWorkspaceId = proposal.workspace_id;
      }
    }

    if (!finalWorkspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get financing profile for this workspace and provider
    const { data: financingProfile } = await supabase
      .from("financing_profiles")
      .select("*")
      .eq("workspace_id", finalWorkspaceId)
      .eq("provider", financing_provider)
      .eq("is_active", true)
      .single();

    // Create application
    const { data: application, error: insertError } = await supabase
      .from("financing_applications")
      .insert({
        lead_id: lead_id || null,
        job_id: job_id || null,
        proposal_id: proposal_id || null,
        workspace_id: finalWorkspaceId,
        financing_provider,
        financing_profile_id: financingProfile?.id || null,
        amount_requested,
        status: "started",
        application_data: application_data || {},
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating financing application:", insertError);
      return NextResponse.json(
        { error: "Failed to create application" },
        { status: 500 }
      );
    }

    // Log click event for "started_application"
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/financing-click`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        lead_id,
        job_id,
        proposal_id,
        workspace_id: finalWorkspaceId,
        event_type: "started_application",
        source: proposal_id ? "proposal" : job_id ? "job" : "lead",
        amount: amount_requested,
      }),
    });

    return NextResponse.json({ ok: true, application });
  } catch (error: any) {
    console.error("Error creating financing application:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































