// Helper API: List Roofing Companies
// GET /api/roofing-companies/list

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

    const { data: companies, error } = await supabase
      .from("roofing_companies")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load companies", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      companies: companies || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























