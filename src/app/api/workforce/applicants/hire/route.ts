// POST /api/workforce/applicants/hire - Convert applicant to employee
// Block 251200 — Hiring Pipeline Kanban

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
    const { id, role, skill_level } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // 1) Get applicant
    const { data: applicant, error: applicantError } = await supabase
      .from("workforce_applicants")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (applicantError || !applicant) {
      return NextResponse.json(
        { error: "Applicant not found" },
        { status: 404 }
      );
    }

    // 2) Determine role from position_applied or use provided role
    let employeeRole = role;
    if (!employeeRole) {
      const position = applicant.position_applied?.toLowerCase() || "";
      if (position.includes("foreman")) {
        employeeRole = "foreman";
      } else if (position.includes("installer")) {
        employeeRole = "installer";
      } else if (position.includes("manager")) {
        employeeRole = "project_manager";
      } else if (position.includes("estimator")) {
        employeeRole = "estimator";
      } else if (position.includes("sales")) {
        employeeRole = "sales";
      } else {
        employeeRole = "laborer";
      }
    }

    // 3) Create employee
    const { data: employee, error: employeeError } = await supabase
      .from("workforce_employees")
      .insert({
        company_id: companyId,
        first_name: applicant.first_name,
        last_name: applicant.last_name,
        phone: applicant.phone,
        email: applicant.email,
        role: employeeRole,
        skill_level: skill_level || "apprentice",
        status: "active",
        hire_date: new Date().toISOString().split("T")[0],
      })
      .select("*")
      .single();

    if (employeeError) {
      console.error("Error creating employee from applicant:", employeeError);
      return NextResponse.json(
        { error: employeeError.message },
        { status: 500 }
      );
    }

    // 4) Update applicant status → hired
    await supabase
      .from("workforce_applicants")
      .update({ status: "hired" })
      .eq("id", id);

    return NextResponse.json({ employee, applicant });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/applicants/hire:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























