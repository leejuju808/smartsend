// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Crew Material Proof Upload
// POST /api/jobs/[jobId]/materials/crew-proof

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      proof_type,
      photo_url,
      uploaded_by,
      material_order_id,
      notes,
    } = body;

    if (!proof_type || !photo_url) {
      return NextResponse.json(
        { error: "proof_type and photo_url are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Create crew material proof record
    const { data: proof, error: proofError } = await supabase
      .from("crew_material_proofs")
      .insert({
        job_id: jobId,
        workspace_id: job.workspace_id,
        material_order_id: material_order_id || null,
        proof_type,
        photo_url,
        uploaded_by: uploaded_by || user.id,
        notes: notes || null,
      })
      .select()
      .single();

    if (proofError) {
      return NextResponse.json(
        { error: proofError.message || "Failed to upload proof" },
        { status: 500 }
      );
    }

    // Log timeline event
    await supabase.rpc("log_job_timeline_event", {
      p_job_id: jobId,
      p_lead_id: null,
      p_event_type: "crew_photo_uploaded",
      p_event_subtype: proof_type,
      p_message: `Crew uploaded ${proof_type} proof`,
      p_event_data: {
        proof_id: proof.id,
        proof_type,
      },
    });

    return NextResponse.json({
      success: true,
      proof,
    });
  } catch (error: any) {
    console.error("Error in crew proof upload API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get crew material proofs for this job
    const { data: proofs, error: proofsError } = await supabase
      .from("crew_material_proofs")
      .select("*")
      .eq("job_id", jobId)
      .order("uploaded_at", { ascending: false });

    if (proofsError) {
      return NextResponse.json(
        { error: proofsError.message || "Failed to fetch proofs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      proofs: proofs || [],
    });
  } catch (error: any) {
    console.error("Error in crew proof fetch API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































