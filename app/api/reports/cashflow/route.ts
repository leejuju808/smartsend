import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * GET /api/reports/cashflow
 * Get cashflow and AR/AP report
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const company_id = searchParams.get("company_id");
    const period_start = searchParams.get("period_start");
    const period_end = searchParams.get("period_end");

    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("report_cashflow")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("period_start", { ascending: false });

    if (company_id) {
      query = query.eq("roofing_company_id", company_id);
    }

    if (period_start) {
      query = query.gte("period_start", period_start);
    }

    if (period_end) {
      query = query.lte("period_end", period_end);
    }

    const { data: reports, error } = await query;

    if (error) {
      throw error;
    }

    // Get latest report for current status
    const latest = reports && reports.length > 0 ? reports[0] : null;

    // Calculate 30/60/90 day projections
    const projections = {
      next_30_days: {
        projected_in: latest ? Number(latest.projected_in) || 0 : 0,
        projected_out: latest ? Number(latest.projected_out) || 0 : 0,
        projected_net: latest ? Number(latest.projected_net) || 0 : 0,
      },
      next_60_days: {
        projected_in: latest ? (Number(latest.projected_in) || 0) * 2 : 0,
        projected_out: latest ? (Number(latest.projected_out) || 0) * 2 : 0,
        projected_net: latest ? (Number(latest.projected_net) || 0) * 2 : 0,
      },
      next_90_days: {
        projected_in: latest ? (Number(latest.projected_in) || 0) * 3 : 0,
        projected_out: latest ? (Number(latest.projected_out) || 0) * 3 : 0,
        projected_net: latest ? (Number(latest.projected_net) || 0) * 3 : 0,
      },
    };

    return NextResponse.json({
      reports: reports || [],
      current: latest,
      projections,
    });
  } catch (error: any) {
    console.error("Error fetching cashflow report:", error);
    return NextResponse.json(
      { error: "Failed to fetch cashflow report", details: error.message },
      { status: 500 }
    );
  }
}

























