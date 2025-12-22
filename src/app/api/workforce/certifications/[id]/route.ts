// PATCH /api/workforce/certifications/[id] - Update certification
// DELETE /api/workforce/certifications/[id] - Delete certification

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

    // Verify certification belongs to company employee
    const { data: cert } = await supabase
      .from("workforce_certifications")
      .select(`
        *,
        employee:workforce_employees!inner(company_id)
      `)
      .eq("id", id)
      .eq("employee.company_id", companyId)
      .single();

    if (!cert) {
      return NextResponse.json({ error: "Certification not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("workforce_certifications")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating certification:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ certification: data });
  } catch (error: any) {
    console.error("Error in PATCH /api/workforce/certifications/[id]:", error);
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

    // Verify certification belongs to company employee
    const { data: cert } = await supabase
      .from("workforce_certifications")
      .select(`
        *,
        employee:workforce_employees!inner(company_id)
      `)
      .eq("id", id)
      .eq("employee.company_id", companyId)
      .single();

    if (!cert) {
      return NextResponse.json({ error: "Certification not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("workforce_certifications")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting certification:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/workforce/certifications/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























