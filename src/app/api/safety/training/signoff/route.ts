// POST /api/safety/training/signoff - Create digital sign-off

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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
    const {
      assignment_id,
      employee_id,
      signature_data,
      signature_url,
      signed_name,
      gps_latitude,
      gps_longitude,
    } = body;

    if (!assignment_id || !employee_id || !signed_name) {
      return NextResponse.json(
        { error: "Assignment ID, employee ID, and signed name are required" },
        { status: 400 }
      );
    }

    // Verify assignment belongs to company and employee
    const { data: assignment } = await supabase
      .from("safety_training_assignments")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, id)
      `)
      .eq("id", assignment_id)
      .eq("employee_id", employee_id)
      .eq("employee.company_id", companyId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Get IP address and user agent
    const ip_address = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const user_agent = req.headers.get("user-agent") || "unknown";

    const { data, error } = await supabase
      .from("safety_training_signoff")
      .insert({
        assignment_id,
        employee_id,
        signature_data: signature_data || null,
        signature_url: signature_url || null,
        signed_name,
        gps_latitude: gps_latitude || null,
        gps_longitude: gps_longitude || null,
        ip_address,
        user_agent,
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating sign-off:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update assignment status to completed
    await supabase
      .from("safety_training_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", assignment_id);

    return NextResponse.json({ signoff: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/safety/training/signoff:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























