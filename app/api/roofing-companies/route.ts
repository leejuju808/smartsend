// Helper API to get roofing companies for a user
// GET /api/roofing-companies?user_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
    }

    // Get roofing companies for this user
    const { data: companies, error } = await supabase
      .from("roofing_companies")
      .select("id, name, workspace_id")
      .or(`owner_id.eq.${userId},id.in.(SELECT roofing_company_id FROM roofing_company_members WHERE user_id.eq.${userId})`)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching roofing companies:", error);
      return NextResponse.json(
        { error: "Failed to fetch companies" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      companies: companies || [],
    });
  } catch (error: any) {
    console.error("Error in roofing companies API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


























