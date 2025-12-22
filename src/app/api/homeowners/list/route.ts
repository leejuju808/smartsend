// Helper API: List Homeowners
// GET /api/homeowners/list

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

    // Get homeowners from jobs owned by user's companies
    const { data: companies } = await supabase
      .from("roofing_companies")
      .select("id")
      .eq("owner_id", user.id);

    const companyIds = companies?.map((c) => c.id) || [];

    if (companyIds.length === 0) {
      return NextResponse.json({
        ok: true,
        homeowners: [],
      });
    }

    // Get homeowners linked to estimates for these companies
    const { data: estimates } = await supabase
      .from("estimates")
      .select("homeowner_id")
      .in("company_id", companyIds)
      .not("homeowner_id", "is", null);

    const homeownerIds = [
      ...new Set(estimates?.map((e) => e.homeowner_id).filter(Boolean) || []),
    ];

    if (homeownerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        homeowners: [],
      });
    }

    const { data: homeowners, error } = await supabase
      .from("homeowners")
      .select("id, name, email")
      .in("id", homeownerIds)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load homeowners", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      homeowners: homeowners || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























