// GET /api/safety/compliance - Get OSHA compliance dashboard data

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

    // Call the database function to get compliance data
    const { data, error } = await supabase.rpc("get_osha_compliance_dashboard", {
      _company_id: companyId,
    });

    if (error) {
      console.error("Error fetching compliance dashboard:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ compliance: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/safety/compliance:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
























