// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Generate Scope with AI
// POST /api/jobs/[jobId]/insurance-claim/generate-scope

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Get job details
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    // Get photo analyses
    const { data: photoAnalyses } = await supabase
      .from("claim_photo_analyses")
      .select("recommended_line_items, est_squares, damage_types, materials")
      .eq("claim_id", claim.id);

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/generate-scope`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          claim_id: claim.id,
          job_details: job,
          photo_analyses: photoAnalyses || [],
          roof_size: body.roof_size,
          materials: body.materials,
          damage_type: body.damage_type,
          local_codes: body.local_codes,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to generate scope" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Error in generate-scope:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























