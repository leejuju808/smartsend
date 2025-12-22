// Block 251900 — Crew Assignment Engine
// GET /api/workforce/schedule/board
// Get schedule data for the production calendar (jobs, assignments, conflicts)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get jobs with staffing status
    const { data: jobs, error: jobsError } = await supabase
      .from("job_staffing_status")
      .select("*")
      .eq("company_id", companyId)
      .gte("production_date", startDate)
      .lte("production_date", endDate)
      .order("production_date", { ascending: true });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
      return NextResponse.json({ error: jobsError.message }, { status: 500 });
    }

    // Get all assignments for these jobs
    const jobIds = (jobs || []).map((j) => j.id);
    const { data: assignments, error: assignmentsError } = await supabase
      .from("crew_assignments")
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name, role),
        job:jobs(id, homeowner_name, address)
      `)
      .in("job_id", jobIds.length > 0 ? jobIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("assigned_date", startDate)
      .lte("assigned_date", endDate);

    if (assignmentsError) {
      console.error("Error fetching assignments:", assignmentsError);
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    // Get conflicts
    const { data: conflicts } = await supabase.rpc("get_crew_conflicts", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    // Get available employees
    const { data: employees } = await supabase
      .from("workforce_employees")
      .select("id, first_name, last_name, role, skill_level, status")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("first_name", { ascending: true });

    return NextResponse.json({
      jobs: jobs || [],
      assignments: assignments || [],
      conflicts: conflicts || [],
      employees: employees || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/schedule/board:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























