// Block 251900 — Crew Assignment Engine
// GET /api/workforce/schedule/conflicts
// Get conflicts (employees assigned to multiple jobs on same day)

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

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("start_date") || new Date().toISOString().split("T")[0];
    const endDate = searchParams.get("end_date") || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Call the conflict detection function
    const { data, error } = await supabase.rpc("get_crew_conflicts", {
      p_company_id: companyId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      console.error("Error fetching conflicts:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conflicts: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/schedule/conflicts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























