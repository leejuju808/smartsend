// Block 253500 — Jobsite Live View Engine
// GET /api/workforce/location/breadcrumbs
// Returns GPS breadcrumb trail for an employee

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const employee_id = searchParams.get("employee_id");
    const start_time = searchParams.get("start_time");
    const end_time = searchParams.get("end_time");

    if (!employee_id) {
      return NextResponse.json(
        { error: "employee_id is required" },
        { status: 400 }
      );
    }

    // Verify employee exists and user has access
    const { data: employee, error: empError } = await supabase
      .from("workforce_employees")
      .select("id, status")
      .eq("id", employee_id)
      .single();

    if (empError || !employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    // Get breadcrumbs
    const { data: breadcrumbs, error: breadcrumbError } = await supabase.rpc(
      "get_employee_breadcrumbs",
      {
        p_employee_id: employee_id,
        p_start_time: start_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        p_end_time: end_time || new Date().toISOString(),
      }
    );

    if (breadcrumbError) {
      console.error("Error fetching breadcrumbs:", breadcrumbError);
      return NextResponse.json(
        { error: "Failed to fetch breadcrumbs" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      breadcrumbs: breadcrumbs || [],
    });
  } catch (error: any) {
    console.error("Error in breadcrumbs fetch:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























