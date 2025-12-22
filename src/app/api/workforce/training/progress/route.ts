// GET /api/workforce/training/progress - Get training progress
// POST /api/workforce/training/progress - Update training progress

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

    let query = supabase
      .from("workforce_training_progress")
      .select(`
        *,
        employee:workforce_employees!inner(company_id),
        module:workforce_training_modules(*)
      `)
      .eq("employee.company_id", companyId);

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (module_id) {
      query = query.eq("module_id", module_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching training progress:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ progress: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/training/progress:", error);
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
    const { employee_id, module_id, status, score, notes } = body;

    if (!employee_id || !module_id) {
      return NextResponse.json(
        { error: "Employee ID and module ID are required" },
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

    const updateData: any = {
      status: status || "in_progress",
    };

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (status === "in_progress" && !body.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (score !== undefined) {
      updateData.score = score;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data, error } = await supabase
      .from("workforce_training_progress")
      .upsert(
        {
          employee_id,
          module_id,
          ...updateData,
        },
        { onConflict: "employee_id,module_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error updating training progress:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ progress: data });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/training/progress:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























