// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// API Route: Analyze Photos with AI
// POST /api/jobs/[jobId]/insurance-claim/analyze-photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

    // Get photos from job (you may need to adjust this based on your photo storage)
    const { data: photos } = await supabase
      .from("roof_photos")
      .select("photo_url")
      .eq("job_id", jobId);

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: "No photos found for this job" },
        { status: 404 }
      );
    }

    const photoUrls = photos.map((p) => p.photo_url).filter(Boolean);

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/analyze-roof-photos`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          claim_id: claim.id,
          photo_urls: photoUrls,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || "Failed to analyze photos" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Error in analyze-photos:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























