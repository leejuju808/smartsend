// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// API Route: Get Proposal Data from Token
// GET /api/proposal-from-token/[token]

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    // Get token row
    const { data: tokenRow, error: tokenError } = await serviceSupabase
      .from("roofing_proposal_tokens")
      .select("*")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (tokenError || !tokenRow) {
      return NextResponse.json(
        { error: "Link invalid or expired" },
        { status: 404 }
      );
    }

    // Check if token is expired
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Link has expired" },
        { status: 410 }
      );
    }

    // Get job info
    const { data: job, error: jobError } = await serviceSupabase
      .from("roofing_jobs")
      .select("id, homeowner_name, address, job_name")
      .eq("id", tokenRow.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get proposal for this tier
    const { data: proposal, error: proposalError } = await serviceSupabase
      .from("roofing_proposals")
      .select("*")
      .eq("job_id", tokenRow.job_id)
      .eq("tier", tokenRow.proposal_tier)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Check if already accepted
    const { data: existingAcceptance } = await serviceSupabase
      .from("roofing_proposal_acceptances")
      .select("id, decision, decision_at")
      .eq("job_id", tokenRow.job_id)
      .eq("decision", "accepted")
      .order("decision_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      token: tokenRow.token,
      job: {
        id: job.id,
        job_name: job.job_name || job.homeowner_name,
        homeowner_name: job.homeowner_name,
        address: job.address,
      },
      proposal: {
        id: proposal.id,
        tier: proposal.tier,
        title: proposal.title,
        subtitle: proposal.subtitle,
        price: proposal.price,
        features: proposal.features || [],
        warranty_text: proposal.warranty_text,
      },
      already_accepted: existingAcceptance?.decision === "accepted",
      acceptance_date: existingAcceptance?.decision_at,
    });
  } catch (error: any) {
    console.error("Error fetching proposal from token:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































