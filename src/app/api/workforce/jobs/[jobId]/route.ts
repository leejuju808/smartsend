// GET /api/workforce/jobs/[jobId] - Get job details for workforce/production

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const { jobId } = await params;

    // Get job with related data
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address
        )
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify job belongs to company
    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    return NextResponse.json({ job });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























