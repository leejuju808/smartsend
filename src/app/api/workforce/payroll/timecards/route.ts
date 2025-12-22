// Block 253700 — Crew Payroll Engine v1
// GET /api/workforce/payroll/timecards - Get timecards
// POST /api/workforce/payroll/timecards - Create timecard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
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

    const searchParams = req.nextUrl.searchParams;
    const employeeId = searchParams.get("employee_id");
    const jobId = searchParams.get("job_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const status = searchParams.get("status");

    let query = supabase
      .from("employee_timecards")
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name, role),
        job:jobs(id, address, homeowner_name)
      `)
      .eq("company_id", companyId)
      .order("clock_in", { ascending: false });

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }
    if (jobId) {
      query = query.eq("job_id", jobId);
    }
    if (startDate) {
      query = query.gte("clock_in", startDate);
    }
    if (endDate) {
      query = query.lte("clock_in", endDate);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: timecards, error } = await query;

    if (error) {
      console.error("Error fetching timecards:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ timecards: timecards || [] });
  } catch (error: any) {
    console.error("Error in timecards GET API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

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
    const {
      employee_id,
      job_id,
      clock_in,
      clock_out,
      clock_in_lat,
      clock_in_lng,
      clock_out_lat,
      clock_out_lng,
      pay_type,
      notes,
    } = body;

    if (!employee_id || !clock_in) {
      return NextResponse.json(
        { error: "employee_id and clock_in are required" },
        { status: 400 }
      );
    }

    // Verify employee belongs to company
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, company_id")
      .eq("id", employee_id)
      .eq("company_id", companyId)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: "Employee not found or doesn't belong to company" },
        { status: 404 }
      );
    }

    // Create timecard
    const { data: timecard, error: insertError } = await supabase
      .from("employee_timecards")
      .insert({
        employee_id,
        job_id: job_id || null,
        company_id,
        clock_in: clock_in || new Date().toISOString(),
        clock_out: clock_out || null,
        clock_in_lat: clock_in_lat || null,
        clock_in_lng: clock_in_lng || null,
        clock_out_lat: clock_out_lat || null,
        clock_out_lng: clock_out_lng || null,
        pay_type: pay_type || "hourly",
        notes: notes || null,
        status: "pending",
      })
      .select(`
        *,
        employee:workforce_employees(id, first_name, last_name, role),
        job:jobs(id, address, homeowner_name)
      `)
      .single();

    if (insertError) {
      console.error("Error creating timecard:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // If job requires prevailing wage, apply it
    if (job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("prevailing_wage, prevailing_wage_rate")
        .eq("id", job_id)
        .single();

      if (job?.prevailing_wage) {
        await supabase.rpc("apply_prevailing_wage_to_timecard", {
          p_timecard_id: timecard.id,
        });
      }
    }

    return NextResponse.json({ timecard }, { status: 201 });
  } catch (error: any) {
    console.error("Error in timecards POST API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























