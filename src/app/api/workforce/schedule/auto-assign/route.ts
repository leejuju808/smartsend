// Block 251900 — Crew Assignment Engine
// POST /api/workforce/schedule/auto-assign
// Auto-assign crew to a job using the RPC function

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { job_id, assigned_date } = body;

    if (!job_id || !assigned_date) {
      return NextResponse.json(
        { error: "job_id and assigned_date are required" },
        { status: 400 }
      );
    }

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", job_id)
      .eq("company_id", companyId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Call auto-assign RPC function
    const { data, error } = await supabase.rpc("auto_assign_crew", {
      p_job_id: job_id,
      p_date_in: assigned_date,
      p_company_id: companyId,
    });

    if (error) {
      console.error("Error auto-assigning crew:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/workforce/schedule/auto-assign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























