// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// API Route: Create Approval Link for Proposal
// POST /api/job/[job_id]/create-approval-link

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const { proposal_tier } = await req.json(); // 'good' | 'better' | 'best'

    if (!proposal_tier || !["good", "better", "best"].includes(proposal_tier)) {
      return NextResponse.json(
        { error: "Invalid proposal_tier. Must be 'good', 'better', or 'best'" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Sanity check: ensure that tier exists for this job
    const { data: proposal, error: proposalError } = await serviceSupabase
      .from("roofing_proposals")
      .select("id, tier, job_id")
      .eq("job_id", job_id)
      .eq("tier", proposal_tier)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal tier not found for this job" },
        { status: 404 }
      );
    }

    // Generate a short, shareable token (retry if collision)
    let token: string;
    let tokenData: any;
    let tokenError: any;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      token = crypto
        .randomBytes(6)
        .toString("base64url")
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 8);

      const result = await serviceSupabase
        .from("roofing_proposal_tokens")
        .insert({
          job_id,
          proposal_tier,
          token,
          expires_at: null, // or set expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          is_active: true,
        })
        .select("*")
        .single();

      tokenData = result.data;
      tokenError = result.error;
      attempts++;

      // If it's a unique constraint violation, retry with new token
      if (tokenError && tokenError.code === "23505" && attempts < maxAttempts) {
        continue;
      }

      break;
    } while (attempts < maxAttempts);

    if (tokenError || !tokenData) {
      console.error("Error creating token:", tokenError);
      return NextResponse.json(
        { error: "Failed to create approval link" },
        { status: 500 }
      );
    }

    const publicBase =
      process.env.NEXT_PUBLIC_APP_URL || "https://app.smartsendhq.com";
    const approvalUrl = `${publicBase}/p/${tokenData.token}`;

    return NextResponse.json({
      approvalUrl,
      token: tokenData.token,
      expires_at: tokenData.expires_at,
    });
  } catch (error: any) {
    console.error("Error creating approval link:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































