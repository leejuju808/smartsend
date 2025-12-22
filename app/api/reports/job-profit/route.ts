import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * GET /api/reports/job-profit
 * Get job profitability report
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
    const start_date = searchParams.get("start_date");
    const end_date = searchParams.get("end_date");
    const job_type = searchParams.get("job_type");

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
      .from("report_job_profit")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });

    if (company_id) {
      query = query.eq("roofing_company_id", company_id);
    }

    if (start_date) {
      query = query.gte("created_at", start_date);
    }

    if (end_date) {
      query = query.lte("created_at", end_date);
    }

    if (job_type) {
      query = query.eq("job_type", job_type);
    }

    const { data: reports, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate summary stats
    const totalRevenue = reports?.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0) || 0;
    const totalCost = reports?.reduce((sum, r) => sum + (Number(r.total_cost) || 0), 0) || 0;
    const totalProfit = reports?.reduce((sum, r) => sum + (Number(r.profit) || 0), 0) || 0;
    const avgMargin = reports && reports.length > 0
      ? reports.reduce((sum, r) => sum + (Number(r.margin) || 0), 0) / reports.length
      : 0;

    // Group by job type
    const byJobType = (reports || []).reduce((acc: any, r) => {
      const type = r.job_type || "other";
      if (!acc[type]) {
        acc[type] = { count: 0, revenue: 0, profit: 0, margin: 0 };
      }
      acc[type].count++;
      acc[type].revenue += Number(r.revenue) || 0;
      acc[type].profit += Number(r.profit) || 0;
      acc[type].margin = acc[type].revenue > 0
        ? (acc[type].profit / acc[type].revenue) * 100
        : 0;
      return acc;
    }, {});

    // Loss-generating jobs
    const lossJobs = (reports || []).filter(r => (Number(r.profit) || 0) < 0);

    const summary = {
      total_jobs: reports?.length || 0,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      total_profit: totalProfit,
      avg_margin: avgMargin,
      by_job_type: byJobType,
      loss_jobs_count: lossJobs.length,
      loss_jobs_total: lossJobs.reduce((sum, r) => sum + (Number(r.profit) || 0), 0),
    };

    return NextResponse.json({
      reports: reports || [],
      summary,
    });
  } catch (error: any) {
    console.error("Error fetching job profit report:", error);
    return NextResponse.json(
      { error: "Failed to fetch job profit report", details: error.message },
      { status: 500 }
    );
  }
}

























