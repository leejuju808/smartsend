// Block 253700 — Crew Payroll Engine v1
// GET /api/workforce/payroll/disputes - Get disputes
// POST /api/workforce/payroll/disputes - Create dispute

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
    const status = searchParams.get("status");

    let query = supabase
      .from("payroll_disputes")
      .select(`
        *,
        timecard:employee_timecards(id, clock_in, clock_out, total_hours),
        employee:workforce_employees(id, first_name, last_name)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (employeeId) {
      query = query.eq("employee_id", employeeId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data: disputes, error } = await query;

    if (error) {
      console.error("Error fetching disputes:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ disputes: disputes || [] });
  } catch (error: any) {
    console.error("Error in disputes GET API:", error);
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
      timecard_id,
      employee_id,
      reason,
      disputed_hours,
      disputed_amount,
      photos,
      notes,
    } = body;

    if (!timecard_id || !employee_id || !reason) {
      return NextResponse.json(
        { error: "timecard_id, employee_id, and reason are required" },
        { status: 400 }
      );
    }

    // Verify timecard belongs to employee and company
    const { data: timecard, error: timecardError } = await supabase
      .from("employee_timecards")
      .select("id, employee_id, company_id")
      .eq("id", timecard_id)
      .eq("employee_id", employee_id)
      .eq("company_id", companyId)
      .single();

    if (timecardError || !timecard) {
      return NextResponse.json(
        { error: "Timecard not found or doesn't belong to employee" },
        { status: 404 }
      );
    }

    // Create dispute
    const { data: dispute, error: insertError } = await supabase
      .from("payroll_disputes")
      .insert({
        timecard_id,
        employee_id,
        company_id: companyId,
        reason,
        disputed_hours: disputed_hours || null,
        disputed_amount: disputed_amount || null,
        photos: photos || [],
        notes: notes || null,
        status: "pending",
      })
      .select(`
        *,
        timecard:employee_timecards(id, clock_in, clock_out, total_hours),
        employee:workforce_employees(id, first_name, last_name)
      `)
      .single();

    if (insertError) {
      console.error("Error creating dispute:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update timecard status to disputed
    await supabase
      .from("employee_timecards")
      .update({ status: "disputed" })
      .eq("id", timecard_id);

    return NextResponse.json({ dispute }, { status: 201 });
  } catch (error: any) {
    console.error("Error in disputes POST API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























