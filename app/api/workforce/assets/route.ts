// GET /api/workforce/assets - List assets
// POST /api/workforce/assets - Create asset

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
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let query = supabase
      .from("assets")
      .select(`
        *,
        current_assignment:asset_assignments!left(
          id,
          employee_id,
          job_id,
          assigned_at,
          employee:workforce_employees(first_name, last_name)
        )
      `)
      .eq("company_id", companyId)
      .is("current_assignment.returned_at", null)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,serial_number.ilike.%${search}%,notes.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching assets:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assets: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/assets:", error);
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
      name,
      category,
      serial_number,
      status,
      photo_url,
      purchase_date,
      purchase_price,
      notes,
    } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "Name and category are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("assets")
      .insert({
        company_id: companyId,
        name,
        category,
        serial_number: serial_number || null,
        status: status || "available",
        photo_url: photo_url || null,
        purchase_date: purchase_date || null,
        purchase_price: purchase_price || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating asset:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/assets:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























