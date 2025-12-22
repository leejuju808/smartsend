// GET /api/workforce/employees - List employees
// POST /api/workforce/employees - Create employee

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
    const status = searchParams.get("status") || "active";
    const role = searchParams.get("role");
    const search = searchParams.get("search");

    let query = supabase
      .from("workforce_employees")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (role) {
      query = query.eq("role", role);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching employees:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ employees: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/employees:", error);
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
    const { first_name, last_name, phone, email, role, skill_level, status, hire_date } = body;

    if (!first_name || !last_name) {
      return NextResponse.json({ error: "First name and last name are required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("workforce_employees")
      .insert({
        company_id: companyId,
        first_name,
        last_name,
        phone: phone || null,
        email: email || null,
        role: role || "laborer",
        skill_level: skill_level || "mid",
        status: status || "active",
        hire_date: hire_date || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating employee:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ employee: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/employees:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























