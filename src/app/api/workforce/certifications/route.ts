// GET /api/workforce/certifications - List certifications
// POST /api/workforce/certifications - Create certification

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
    const expiring_soon = searchParams.get("expiring_soon"); // days

    let query = supabase
      .from("workforce_certifications")
      .select(`
        *,
        employee:workforce_employees!inner(company_id, first_name, last_name)
      `)
      .eq("employee.company_id", companyId)
      .order("expiry_date", { ascending: true, nullsLast: true });

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (expiring_soon) {
      const days = parseInt(expiring_soon);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      query = query
        .not("expiry_date", "is", null)
        .lte("expiry_date", futureDate.toISOString().split("T")[0])
        .gte("expiry_date", new Date().toISOString().split("T")[0]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching certifications:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ certifications: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/certifications:", error);
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
    const {
      employee_id,
      cert_name,
      cert_type,
      issue_date,
      expiry_date,
      cert_file_url,
      issuing_organization,
      cert_number,
      notes,
    } = body;

    if (!employee_id || !cert_name || !issue_date) {
      return NextResponse.json(
        { error: "Employee ID, certificate name, and issue date are required" },
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

    const { data, error } = await supabase
      .from("workforce_certifications")
      .insert({
        employee_id,
        cert_name,
        cert_type: cert_type || "other",
        issue_date,
        expiry_date: expiry_date || null,
        cert_file_url: cert_file_url || null,
        issuing_organization: issuing_organization || null,
        cert_number: cert_number || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating certification:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ certification: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/certifications:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























