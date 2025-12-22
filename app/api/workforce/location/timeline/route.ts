// Block 253500 — Jobsite Live View Engine
// GET /api/workforce/location/timeline
// Returns detailed timeline of employee movements for a day

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
    const date = searchParams.get("date");

    if (!employee_id) {
      return NextResponse.json(
        { error: "employee_id is required" },
        { status: 400 }
      );
    }

    // Verify employee exists
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

    // Get timeline
    const { data: timeline, error: timelineError } = await supabase.rpc(
      "get_crew_timeline",
      {
        p_employee_id: employee_id,
        p_date: date || new Date().toISOString().split("T")[0],
      }
    );

    if (timelineError) {
      console.error("Error fetching timeline:", timelineError);
      return NextResponse.json(
        { error: "Failed to fetch timeline" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timeline: timeline || [],
    });
  } catch (error: any) {
    console.error("Error in timeline fetch:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























