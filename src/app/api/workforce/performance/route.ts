// GET /api/workforce/performance - List performance logs
// POST /api/workforce/performance - Create performance log

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

    const searchParams = req.nextUrl.searchParams;
    const employee_id = searchParams.get("employee_id");
    const log_type = searchParams.get("log_type");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = supabase
      .from("workforce_performance_logs")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, first_name, last_name)
      `)
      .eq("employee.company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (log_type) {
      query = query.eq("log_type", log_type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching performance logs:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
    const { employee_id, log_type, notes, severity } = body;

    if (!employee_id || !log_type || !notes) {
      return NextResponse.json(
        { error: "Employee ID, log type, and notes are required" },
        { status: 400 }
      );
    }

    // Verify employee belongs to company
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("id", employee_id)
      .eq("company_id", companyId)
      .single();

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("workforce_performance_logs")
      .insert({
        employee_id,
        log_type,
        notes,
        severity: severity || "low",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating performance log:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ log: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/performance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























