// POST /api/company/branding/update
// Update company branding settings

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { roofing_company_id, logo_url, primary_color, secondary_color, email_signature, portal_theme, login_background_url } = body;

    if (!roofing_company_id) {
      return NextResponse.json(
        { error: "roofing_company_id is required" },
        { status: 400 }
      );
    }

    // Check if user can manage branding (owner/admin only)
    const { data: member, error: memberError } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    if (!['owner', 'admin'].includes(member.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can update branding" },
        { status: 403 }
      );
    }

    // Update or create branding
    const brandingData: any = {
      roofing_company_id,
      updated_at: new Date().toISOString(),
    };

    if (logo_url !== undefined) brandingData.logo_url = logo_url;
    if (primary_color !== undefined) brandingData.primary_color = primary_color;
    if (secondary_color !== undefined) brandingData.secondary_color = secondary_color;
    if (email_signature !== undefined) brandingData.email_signature = email_signature;
    if (portal_theme !== undefined) brandingData.portal_theme = portal_theme;
    if (login_background_url !== undefined) brandingData.login_background_url = login_background_url;

    const { data: branding, error: brandingError } = await supabase
      .from("company_branding")
      .upsert(brandingData, {
        onConflict: "roofing_company_id",
      })
      .select()
      .single();

    if (brandingError) {
      console.error("Error updating branding:", brandingError);
      return NextResponse.json(
        { error: "Failed to update branding" },
        { status: 500 }
      );
    }

    // Also update roofing_companies table for backward compatibility
    if (logo_url || primary_color || secondary_color) {
      const companyUpdate: any = {};
      if (logo_url) companyUpdate.logo_url = logo_url;
      if (primary_color) companyUpdate.brand_color_primary = primary_color;
      if (secondary_color) companyUpdate.brand_color_secondary = secondary_color;

      await supabase
        .from("roofing_companies")
        .update(companyUpdate)
        .eq("id", roofing_company_id);
    }

    return NextResponse.json({
      success: true,
      branding,
    });
  } catch (error: any) {
    console.error("Error updating branding:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























