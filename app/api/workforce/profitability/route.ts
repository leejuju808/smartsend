// Block 252600 — Profitability Engine API
// GET /api/workforce/profitability?company_id=xxx&period=week|month|all

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("company_id");
    const period = searchParams.get("period") || "month";
    const jobId = searchParams.get("job_id");

    if (!companyId && !jobId) {
      return NextResponse.json(
        { error: "company_id or job_id is required" },
        { status: 400 }
      );
    }

    // Build date filter
    let cutoffDate: Date | null = null;
    if (period === "week") {
      cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Build query
    let query = supabase.from("job_profitability").select("*");

    if (jobId) {
      query = query.eq("job_id", jobId).single();
    } else if (companyId) {
      query = query.eq("company_id", companyId);
      if (cutoffDate) {
        query = query.gte("created_at", cutoffDate.toISOString());
      }
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching profitability data:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Calculate summary if multiple jobs
    let summary = null;
    if (!jobId && Array.isArray(data)) {
      const totalRevenue = data.reduce((sum, job) => sum + (job.contract_price || 0), 0);
      const totalCosts = data.reduce((sum, job) => sum + (job.total_costs || 0), 0);
      const totalProfit = totalRevenue - totalCosts;
      const avgMargin = data.length > 0
        ? data.reduce((sum, job) => sum + (job.profit_margin || 0), 0) / data.length
        : 0;

      summary = {
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        total_profit: totalProfit,
        avg_margin: avgMargin,
        job_count: data.length,
      };
    }

    return NextResponse.json({
      data,
      summary,
      period,
    });
  } catch (error: any) {
    console.error("Profitability API error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























