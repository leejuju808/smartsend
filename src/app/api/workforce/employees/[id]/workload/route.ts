// Block 251900 — Crew Assignment Engine
// GET /api/workforce/employees/[id]/workload
// Get employee workload (jobs assigned) for a date range

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate =
      searchParams.get("end_date") ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Verify employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, company_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (empError || !employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Get workload using RPC function
    const { data: workload, error: workloadError } = await supabase.rpc("get_employee_workload", {
      p_employee_id: id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (workloadError) {
      console.error("Error fetching workload:", workloadError);
      return NextResponse.json({ error: workloadError.message }, { status: 500 });
    }

    // Get detailed assignments with job info
    const { data: assignments, error: assignmentsError } = await supabase
      .from("crew_assignments")
      .select(
        `
        id,
        assigned_date,
        role_on_job,
        job:jobs(id, homeowner_name, address, job_type, production_date)
      `
      )
      .eq("employee_id", id)
      .gte("assigned_date", startDate)
      .lte("assigned_date", endDate)
      .order("assigned_date", { ascending: true });

    if (assignmentsError) {
      console.error("Error fetching assignments:", assignmentsError);
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    // Check for conflicts (overbooked days)
    const { data: conflicts } = await supabase.rpc("get_crew_conflicts", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    const employeeConflicts = conflicts?.filter((c: any) => c.employee_id === id) || [];

    return NextResponse.json({
      workload: workload || [],
      assignments: assignments || [],
      conflicts: employeeConflicts,
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/employees/[id]/workload:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























