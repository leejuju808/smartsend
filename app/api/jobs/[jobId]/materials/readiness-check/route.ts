// Block 25260 — SmartSend Roofing Supplier & Material Sync v1
// API Route: Material Readiness Check for Scheduling
// GET /api/jobs/[jobId]/materials/readiness-check

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Check material readiness
    const { data: result, error: checkError } = await supabase.rpc(
      "check_material_readiness_for_scheduling",
      {
        p_job_id: jobId,
      }
    );

    if (checkError) {
      return NextResponse.json(
        { error: checkError.message || "Failed to check readiness" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in material readiness check API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































