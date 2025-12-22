// GET /api/safety/training/assignments - Get training assignments
// POST /api/safety/training/assignments - Create training assignment

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
    const module_id = searchParams.get("module_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("safety_training_assignments")
      .select(`
        *,
        module:safety_training_modules(*),
        employee:workforce_employees!inner(company_id, first_name, last_name, role)
      `)
      .eq("employee.company_id", companyId);

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (module_id) {
      query = query.eq("module_id", module_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching training assignments:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignments: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/training/assignments:", error);
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
    const { module_id, employee_id, notes } = body;

    if (!module_id || !employee_id) {
      return NextResponse.json(
        { error: "Module ID and employee ID are required" },
        { status: 400 }
      );
    }

    // Verify employee belongs to company
    const { data: employee } = await supabase
      .from("workforce_employees")
      .select("id, company_id")
      .eq("id", employee_id)
      .eq("company_id", companyId)
      .single();

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Get module to calculate expiration
    const { data: module } = await supabase
      .from("safety_training_modules")
      .select("expires_after_days")
      .eq("id", module_id)
      .single();

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const expiresAfterDays = module.expires_after_days || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresAfterDays);

    const { data, error } = await supabase
      .from("safety_training_assignments")
      .insert({
        module_id,
        employee_id,
        assigned_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        status: "assigned",
        assigned_by: user.id,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating training assignment:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/safety/training/assignments:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























