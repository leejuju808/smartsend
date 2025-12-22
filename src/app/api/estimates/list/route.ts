// Block 220000 — List Estimates
// GET /api/estimates/list

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

    // Get estimates for companies owned by user
    const { data: estimates, error } = await supabase
      .from("estimates")
      .select(`
        *,
        company:roofing_companies(*),
        homeowner:homeowners(*)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load estimates", details: error.message },
        { status: 500 }
      );
    }

    // Filter to only show estimates for companies owned by user
    const filteredEstimates = estimates?.filter(
      (e: any) => e.company?.owner_id === user.id
    ) || [];

    return NextResponse.json({
      ok: true,
      estimates: filteredEstimates,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























