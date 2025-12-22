// Block 253700 — Crew Payroll Engine v1
// POST /api/workforce/payroll/auto-clock - Auto clock-in/out via geofencing
// This integrates with Block 253500 geofencing system

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    const { employee_id, job_id, lat, lng, action } = body; // action: 'clock_in' or 'clock_out'

    if (!employee_id || !job_id || lat === undefined || lng === undefined || !action) {
      return NextResponse.json(
        { error: "employee_id, job_id, lat, lng, and action are required" },
        { status: 400 }
      );
    }

    if (!["clock_in", "clock_out"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'clock_in' or 'clock_out'" },
        { status: 400 }
      );
    }

    // Verify employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, company_id, status")
      .eq("id", employee_id)
      .eq("company_id", companyId)
      .eq("status", "active")
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: "Employee not found or not active" },
        { status: 404 }
      );
    }

    // Verify job exists and belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id, prevailing_wage, prevailing_wage_rate")
      .eq("id", job_id)
      .eq("company_id", companyId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    let result;

    if (action === "clock_in") {
      // Auto clock-in
      const { data: timecardId, error: clockInError } = await supabase.rpc(
        "auto_clock_in_on_job_arrival",
        {
          p_employee_id: employee_id,
          p_job_id: job_id,
          p_lat: lat,
          p_lng: lng,
        }
      );

      if (clockInError) {
        console.error("Error auto clocking in:", clockInError);
        return NextResponse.json({ error: clockInError.message }, { status: 500 });
      }

      // Get created timecard
      const { data: timecard, error: fetchError } = await supabase
        .from("employee_timecards")
        .select(`
          *,
          employee:workforce_employees(id, first_name, last_name, role),
          job:jobs(id, address, homeowner_name)
        `)
        .eq("id", timecardId)
        .single();

      if (fetchError) {
        console.error("Error fetching timecard:", fetchError);
      }

      result = {
        action: "clock_in",
        timecard_id: timecardId,
        timecard: timecard,
        message: "Auto clocked in successfully",
      };
    } else {
      // Auto clock-out
      const { error: clockOutError } = await supabase.rpc(
        "auto_clock_out_on_job_departure",
        {
          p_employee_id: employee_id,
          p_job_id: job_id,
          p_lat: lat,
          p_lng: lng,
        }
      );

      if (clockOutError) {
        console.error("Error auto clocking out:", clockOutError);
        return NextResponse.json({ error: clockOutError.message }, { status: 500 });
      }

      // Get updated timecard
      const { data: timecard, error: fetchError } = await supabase
        .from("employee_timecards")
        .select(`
          *,
          employee:workforce_employees(id, first_name, last_name, role),
          job:jobs(id, address, homeowner_name)
        `)
        .eq("employee_id", employee_id)
        .eq("job_id", job_id)
        .eq("DATE(clock_in)", new Date().toISOString().split("T")[0])
        .is("clock_out", null)
        .order("clock_in", { ascending: false })
        .limit(1)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        // PGRST116 = no rows returned, which is fine if already clocked out
        console.error("Error fetching timecard:", fetchError);
      }

      result = {
        action: "clock_out",
        timecard: timecard,
        message: "Auto clocked out successfully",
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in auto-clock API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























