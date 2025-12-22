import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * GET /api/reports/marketing
 * Get marketing channel ROI report
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
    const period = searchParams.get("period") || "monthly";
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
      .from("report_marketing_channels")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("period", period)
      .order("revenue", { ascending: false });

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

    // Calculate summary stats
    const summary = {
      total_channels: reports?.length || 0,
      total_leads: reports?.reduce((sum, r) => sum + (r.leads || 0), 0) || 0,
      total_jobs: reports?.reduce((sum, r) => sum + (r.jobs_won || 0), 0) || 0,
      total_revenue: reports?.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0) || 0,
      total_cost: reports?.reduce((sum, r) => sum + (Number(r.cost) || 0), 0) || 0,
      total_roi: reports && reports.length > 0
        ? reports.reduce((sum, r) => sum + (Number(r.roi) || 0), 0) / reports.length
        : 0,
      avg_cost_per_lead: reports && reports.length > 0
        ? reports.reduce((sum, r) => sum + (Number(r.cost_per_lead) || 0), 0) / reports.length
        : 0,
    };

    return NextResponse.json({
      reports: reports || [],
      summary,
    });
  } catch (error: any) {
    console.error("Error fetching marketing report:", error);
    return NextResponse.json(
      { error: "Failed to fetch marketing report", details: error.message },
      { status: 500 }
    );
  }
}

























