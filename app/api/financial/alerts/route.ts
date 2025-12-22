import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/alerts
 * Get financial alerts for a company
 * Query params: company_id
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Generate financial alerts
    const { data: alerts, error: alertsError } = await supabase.rpc(
      "generate_financial_alerts",
      { p_company_id: companyId }
    );

    if (alertsError) {
      console.error("Financial alerts error:", alertsError);
      return NextResponse.json(
        { error: alertsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(alerts || { alerts: [], alert_count: 0 });
  } catch (error: any) {
    console.error("Get financial alerts error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















