// GET /api/safety/training/modules - List safety training modules
// POST /api/safety/training/modules - Create safety training module

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
    const module_type = searchParams.get("module_type");
    const required_for_role = searchParams.get("required_for_role");

    let query = supabase
      .from("safety_training_modules")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (module_type) {
      query = query.eq("module_type", module_type);
    }

    if (required_for_role) {
      query = query.contains("required_for_roles", [required_for_role]);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching safety training modules:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ modules: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/training/modules:", error);
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
      title,
      description,
      content_url,
      module_type,
      required_for_roles,
      expires_after_days,
      estimated_duration_minutes,
    } = body;

    if (!title || !content_url || !module_type) {
      return NextResponse.json(
        { error: "Title, content URL, and module type are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("safety_training_modules")
      .insert({
        company_id: companyId,
        title,
        description: description || null,
        content_url,
        module_type,
        required_for_roles: required_for_roles || [],
        expires_after_days: expires_after_days || 365,
        estimated_duration_minutes: estimated_duration_minutes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating safety training module:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ module: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/safety/training/modules:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























