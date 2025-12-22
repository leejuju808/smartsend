// GET /api/workforce/applicants - List applicants
// POST /api/workforce/applicants - Create applicant

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
    const status = searchParams.get("status") || "new";
    const search = searchParams.get("search");

    let query = supabase
      .from("workforce_applicants")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,position_applied.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching applicants:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ applicants: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/applicants:", error);
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
    const { first_name, last_name, phone, email, position_applied, resume_url, notes } = body;

    if (!first_name || !last_name || !position_applied) {
      return NextResponse.json(
        { error: "First name, last name, and position applied are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("workforce_applicants")
      .insert({
        company_id: companyId,
        first_name,
        last_name,
        phone: phone || null,
        email: email || null,
        position_applied,
        resume_url: resume_url || null,
        notes: notes || null,
        status: "new",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating applicant:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ applicant: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/applicants:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























