// GET /api/workforce/employees/[id] - Get employee
// PATCH /api/workforce/employees/[id] - Update employee
// DELETE /api/workforce/employees/[id] - Delete employee

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

    // Get employee with related data
    const { data: employee, error: employeeError } = await supabase
      .from("workforce_employees")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (employeeError || !employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Get certifications
    const { data: certifications } = await supabase
      .from("workforce_certifications")
      .select("*")
      .eq("employee_id", id)
      .order("expiry_date", { ascending: true, nullsLast: true });

    // Get training progress
    const { data: trainingProgress } = await supabase
      .from("workforce_training_progress")
      .select(`
        *,
        module:workforce_training_modules(*)
      `)
      .eq("employee_id", id);

    // Get performance logs
    const { data: performanceLogs } = await supabase
      .from("workforce_performance_logs")
      .select("*")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      employee: {
        ...employee,
        certifications: certifications || [],
        training_progress: trainingProgress || [],
        performance_logs: performanceLogs || [],
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/employees/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
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
    const body = await req.json();

    // Verify employee belongs to company
    const { data: existing } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("workforce_employees")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating employee:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ employee: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/employees/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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

    // Verify employee belongs to company
    const { data: existing } = await supabase
      .from("workforce_employees")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("workforce_employees")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting employee:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/employees/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























