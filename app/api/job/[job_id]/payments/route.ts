// Block 27280 — SmartSend Roofing Deposit & Payment Request Engine v1
// API Route: GET /api/job/[job_id]/payments
// 
// Returns payment summary and payment requests for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;

    if (!job_id) {
      return NextResponse.json(
        { error: "Missing job_id" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch payment summary from view
    const { data: summary, error: summaryError } = await supabase
      .from("roofing_job_payment_summary")
      .select("*")
      .eq("job_id", job_id)
      .single();

    if (summaryError && summaryError.code !== "PGRST116") {
      // PGRST116 is "no rows returned", which is okay
      console.error("Error fetching payment summary:", summaryError);
    }

    // Fetch payment requests
    const { data: requests, error: requestsError } = await supabase
      .from("roofing_payment_requests")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    if (requestsError) {
      console.error("Error fetching payment requests:", requestsError);
      return NextResponse.json(
        { error: requestsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      summary: summary || null,
      requests: requests || [],
    });
  } catch (error: any) {
    console.error("Error fetching payments:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































