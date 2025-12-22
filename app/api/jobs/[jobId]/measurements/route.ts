// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: Get all measurements for a job
// GET /api/jobs/[jobId]/measurements

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all measurements for this job
    const { data: measurements, error: measurementsError } = await serviceSupabase
      .from("roof_measurements")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (measurementsError) {
      console.error("Error fetching measurements:", measurementsError);
      return NextResponse.json(
        { error: "Failed to fetch measurements", details: measurementsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      measurements: measurements || [],
    });
  } catch (error: any) {
    console.error("Error in measurements API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
