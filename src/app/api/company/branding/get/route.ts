// GET /api/company/branding/get
// Get company branding settings

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

    // Get branding
    const { data: branding, error: brandingError } = await supabase
      .from("company_branding")
      .select("*")
      .eq("roofing_company_id", roofing_company_id)
      .single();

    if (brandingError && brandingError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("Error fetching branding:", brandingError);
      return NextResponse.json(
        { error: "Failed to fetch branding" },
        { status: 500 }
      );
    }

    // If no branding exists, return defaults or from roofing_companies
    if (!branding) {
      const { data: company } = await supabase
        .from("roofing_companies")
        .select("logo_url, brand_color_primary, brand_color_secondary")
        .eq("id", roofing_company_id)
        .single();

      return NextResponse.json({
        success: true,
        branding: {
          roofing_company_id,
          logo_url: company?.logo_url || null,
          primary_color: company?.brand_color_primary || '#1E40AF',
          secondary_color: company?.brand_color_secondary || '#3B82F6',
          email_signature: null,
          portal_theme: {},
          login_background_url: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      branding,
    });
  } catch (error: any) {
    console.error("Error fetching branding:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























