// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// API Route: Get Signing Status for Job
// GET /api/job/[job_id]/signing-status

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;

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

    // Get active tokens
    const { data: tokens, error: tokensError } = await serviceSupabase
      .from("roofing_proposal_tokens")
      .select("*")
      .eq("job_id", job_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (tokensError) {
      console.error("Error fetching tokens:", tokensError);
    }

    // Get acceptance history
    const { data: acceptances, error: acceptancesError } = await serviceSupabase
      .from("roofing_proposal_acceptances")
      .select("*")
      .eq("job_id", job_id)
      .order("decision_at", { ascending: false });

    if (acceptancesError) {
      console.error("Error fetching acceptances:", acceptancesError);
    }

    return NextResponse.json({
      tokens: tokens || [],
      acceptances: acceptances || [],
    });
  } catch (error: any) {
    console.error("Error fetching signing status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































