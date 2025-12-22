// GET /api/workforce/training/modules - List training modules
// POST /api/workforce/training/modules - Create training module

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
    const required_for_role = searchParams.get("required_for_role");

    let query = supabase
      .from("workforce_training_modules")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (required_for_role) {
      query = query.eq("required_for_role", required_for_role);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching training modules:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ modules: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/training/modules:", error);
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
      content_type,
      required_for_role,
      estimated_duration_minutes,
    } = body;

    if (!title || !content_url) {
      return NextResponse.json(
        { error: "Title and content URL are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("workforce_training_modules")
      .insert({
        company_id: companyId,
        title,
        description: description || null,
        content_url,
        content_type: content_type || "video",
        required_for_role: required_for_role || null,
        estimated_duration_minutes: estimated_duration_minutes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating training module:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ module: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/training/modules:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























