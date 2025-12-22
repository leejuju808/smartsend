// Block 253500 — Jobsite Live View Engine
// GET /api/workforce/location/eta
// Calculates estimated arrival time to job site

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const employee_id = searchParams.get("employee_id");
    const job_id = searchParams.get("job_id");

    if (!employee_id || !job_id) {
      return NextResponse.json(
        { error: "employee_id and job_id are required" },
        { status: 400 }
      );
    }

    // Verify employee and job exist
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, status")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Calculate ETA
    const { data: eta, error: etaError } = await supabase.rpc(
      "calculate_job_eta",
      {
        p_employee_id: employee_id,
        p_job_id: job_id,
      }
    );

    if (etaError) {
      console.error("Error calculating ETA:", etaError);
      return NextResponse.json(
        { error: "Failed to calculate ETA" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      eta: eta || null,
    });
  } catch (error: any) {
    console.error("Error in ETA calculation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























