// GET /api/company/templates/list
// List templates for a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const roofing_company_id = searchParams.get("roofing_company_id");
    const template_type = searchParams.get("template_type");

    if (!roofing_company_id) {
      return NextResponse.json(
        { error: "roofing_company_id is required" },
        { status: 400 }
      );
    }

    // Check if user is a member
    const { data: member } = await supabase
      .from("roofing_company_members")
      .select("id")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Build query
    let query = supabase
      .from("templates")
      .select("*")
      .eq("roofing_company_id", roofing_company_id)
      .eq("is_active", true);

    if (template_type) {
      query = query.eq("template_type", template_type);
    }

    const { data: templates, error: templatesError } = await query.order("created_at", { ascending: false });

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      return NextResponse.json(
        { error: "Failed to fetch templates" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      templates: templates || [],
    });
  } catch (error: any) {
    console.error("Error listing templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























