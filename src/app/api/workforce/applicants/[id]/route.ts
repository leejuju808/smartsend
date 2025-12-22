// PATCH /api/workforce/applicants/[id] - Update applicant status
// DELETE /api/workforce/applicants/[id] - Delete applicant

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

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

    // Verify applicant belongs to company
    const { data: existing } = await supabase
      .from("workforce_applicants")
      .select("id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Applicant not found" }, { status: 404 });
    }

    // If status is "hired", create an employee record
    if (body.status === "hired") {
      const { data: applicant } = await supabase
        .from("workforce_applicants")
        .select("*")
        .eq("id", id)
        .single();

      if (applicant) {
        // Create employee from applicant
        const { error: employeeError } = await supabase
          .from("workforce_employees")
          .insert({
            company_id: companyId,
            first_name: applicant.first_name,
            last_name: applicant.last_name,
            phone: applicant.phone,
            email: applicant.email,
            role: applicant.position_applied.toLowerCase().includes("foreman")
              ? "foreman"
              : applicant.position_applied.toLowerCase().includes("installer")
              ? "installer"
              : applicant.position_applied.toLowerCase().includes("manager")
              ? "project_manager"
              : "laborer",
            skill_level: "mid",
            status: "active",
            hire_date: new Date().toISOString().split("T")[0],
          });

        if (employeeError) {
          console.error("Error creating employee from applicant:", employeeError);
        }
      }
    }

    const { data, error } = await supabase
      .from("workforce_applicants")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating applicant:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ applicant: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/applicants/[id]:", error);
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

    const { error } = await supabase
      .from("workforce_applicants")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("Error deleting applicant:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/applicants/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























