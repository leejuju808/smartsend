// GET /api/safety/scores - Get safety scores
// POST /api/safety/scores/calculate - Calculate safety score for employee

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

    let query = supabase
      .from("safety_scores")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, first_name, last_name, role)
      `)
      .eq("employee.company_id", companyId)
      .order("score", { ascending: false });

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching safety scores:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/scores:", error);
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
    const { employee_id } = body;

    if (!employee_id) {
      return NextResponse.json(
        { error: "Employee ID is required" },
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

    // Call the database function to calculate score
    const { data: score, error } = await supabase.rpc("calculate_employee_safety_score", {
      _employee_id: employee_id,
    });

    if (error) {
      console.error("Error calculating safety score:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get the updated score record
    const { data: scoreRecord } = await supabase
      .from("safety_scores")
      .select("*")
      .eq("employee_id", employee_id)
      .single();

    return NextResponse.json({ score: score, scoreRecord });
  } catch (error: any) {
    console.error("Error in POST /api/safety/scores:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























