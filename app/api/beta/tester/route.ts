// Block 10100 — Beta Tester Info API
// GET /api/beta/tester?beta_tester_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const beta_tester_id = searchParams.get("beta_tester_id");

    if (!beta_tester_id) {
      return NextResponse.json(
        { error: "beta_tester_id is required" },
        { status: 400 }
      );
    }

    const { data: betaTester, error } = await supabaseAdmin
      .from("beta_testers")
      .select("*")
      .eq("id", beta_tester_id)
      .single();

    if (error || !betaTester) {
      return NextResponse.json(
        { error: "Beta tester not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      betaTester,
    });
  } catch (error: any) {
    console.error("Error in GET /api/beta/tester:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























































