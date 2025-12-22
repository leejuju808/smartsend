// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Insurance Claim CRUD
// GET /api/jobs/[jobId]/insurance-claim

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create claim
    let { data: claim, error: claimError } = await supabase
      .from("insurance_claims")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (claimError && claimError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to fetch claim", details: claimError.message },
        { status: 500 }
      );
    }

    // Create claim if it doesn't exist
    if (!claim) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, workspace_id, company_id")
        .eq("id", jobId)
        .single();

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      const { data: newClaim, error: createError } = await supabase
        .from("insurance_claims")
        .insert({
          job_id: jobId,
          workspace_id: job.workspace_id,
          company_id: job.company_id,
          status: "open",
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: "Failed to create claim", details: createError.message },
          { status: 500 }
        );
      }

      claim = newClaim;
    }

    // Get line items
    const { data: lineItems } = await supabase
      .from("claim_line_items")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: true });

    // Get supplements
    const { data: supplements } = await supabase
      .from("supplements")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: false });

    // Get photo analyses
    const { data: photoAnalyses } = await supabase
      .from("claim_photo_analyses")
      .select("*")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      claim,
      line_items: lineItems || [],
      supplements: supplements || [],
      photo_analyses: photoAnalyses || [],
    });
  } catch (error: any) {
    console.error("Error in insurance-claim GET:", error);
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
    const { jobId } = await params;
    const body = await req.json();
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create claim
    let { data: claim } = await supabase
      .from("insurance_claims")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    if (!claim) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, workspace_id, company_id")
        .eq("id", jobId)
        .single();

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }

      const { data: newClaim, error: createError } = await supabase
        .from("insurance_claims")
        .insert({
          job_id: jobId,
          workspace_id: job.workspace_id,
          company_id: job.company_id,
          ...body,
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json(
          { error: "Failed to create claim", details: createError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ claim: newClaim });
    }

    // Update existing claim
    const { data: updatedClaim, error: updateError } = await supabase
      .from("insurance_claims")
      .update(body)
      .eq("id", claim.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update claim", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ claim: updatedClaim });
  } catch (error: any) {
    console.error("Error in insurance-claim POST:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























