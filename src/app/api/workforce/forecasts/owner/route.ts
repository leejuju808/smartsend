// GET /api/workforce/forecasts/owner - Get owner-level forecast summary
// Returns aggregated forecast data for all upcoming jobs

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
    const daysAhead = parseInt(searchParams.get("days_ahead") || "30", 10);

    // Get all jobs with forecasts for the company
    const { data: forecasts, error: forecastsError } = await supabase
      .from("job_cost_forecasts")
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address,
          job_type,
          roof_type,
          production_date,
          status,
          contract_value,
          final_value,
          estimated_value
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (forecastsError) {
      console.error("Error fetching forecasts:", forecastsError);
      return NextResponse.json(
        { error: forecastsError.message },
        { status: 500 }
      );
    }

    // Filter to upcoming jobs (not completed)
    const upcomingForecasts = (forecasts || []).filter(
      (f: any) => f.jobs && f.jobs.status !== "completed"
    );

    // Calculate aggregates
    const totalProjectedRevenue = upcomingForecasts.reduce(
      (sum: number, f: any) => sum + (f.contract_price || 0),
      0
    );

    const totalProjectedCost = upcomingForecasts.reduce(
      (sum: number, f: any) => sum + (f.predicted_total_cost || 0),
      0
    );

    const totalProjectedProfit = upcomingForecasts.reduce(
      (sum: number, f: any) => sum + (f.predicted_profit || 0),
      0
    );

    const avgProjectedMargin =
      upcomingForecasts.length > 0
        ? upcomingForecasts.reduce(
            (sum: number, f: any) => sum + (f.predicted_margin || 0),
            0
          ) / upcomingForecasts.length
        : 0;

    // Risk breakdown
    const riskBreakdown = {
      high: upcomingForecasts.filter((f: any) => f.risk_level === "high").length,
      medium: upcomingForecasts.filter((f: any) => f.risk_level === "medium").length,
      low: upcomingForecasts.filter((f: any) => f.risk_level === "low").length,
    };

    // Jobs by margin category
    const marginBreakdown = {
      excellent: upcomingForecasts.filter((f: any) => f.predicted_margin >= 30).length,
      good: upcomingForecasts.filter(
        (f: any) => f.predicted_margin >= 20 && f.predicted_margin < 30
      ).length,
      low: upcomingForecasts.filter((f: any) => f.predicted_margin < 20).length,
    };

    // High-risk jobs with details
    const highRiskJobs = upcomingForecasts
      .filter((f: any) => f.risk_level === "high")
      .map((f: any) => ({
        job_id: f.job_id,
        homeowner_name: f.jobs?.homeowner_name || "Unknown",
        address: f.jobs?.address || "N/A",
        predicted_profit: f.predicted_profit,
        predicted_margin: f.predicted_margin,
        risk_score: f.risk_score,
        risk_factors: [], // Will be populated below
      }));

    // Get risk factors for high-risk jobs
    if (highRiskJobs.length > 0) {
      const jobIds = highRiskJobs.map((j) => j.job_id);
      const { data: riskFactors } = await supabase
        .from("job_risk_factors")
        .select("*")
        .in(
          "forecast_id",
          upcomingForecasts
            .filter((f: any) => f.risk_level === "high")
            .map((f: any) => f.id)
        );

      // Attach risk factors to jobs
      if (riskFactors) {
        const factorsByForecast = riskFactors.reduce((acc: any, factor: any) => {
          if (!acc[factor.forecast_id]) {
            acc[factor.forecast_id] = [];
          }
          acc[factor.forecast_id].push(factor);
          return acc;
        }, {});

        highRiskJobs.forEach((job) => {
          const forecast = upcomingForecasts.find((f: any) => f.job_id === job.job_id);
          if (forecast) {
            job.risk_factors = factorsByForecast[forecast.id] || [];
          }
        });
      }
    }

    // Top profitable jobs
    const topProfitableJobs = [...upcomingForecasts]
      .sort((a: any, b: any) => (b.predicted_profit || 0) - (a.predicted_profit || 0))
      .slice(0, 10)
      .map((f: any) => ({
        job_id: f.job_id,
        homeowner_name: f.jobs?.homeowner_name || "Unknown",
        predicted_profit: f.predicted_profit,
        predicted_margin: f.predicted_margin,
        contract_price: f.contract_price,
      }));

    // Low margin jobs (at risk)
    const lowMarginJobs = upcomingForecasts
      .filter((f: any) => f.predicted_margin < 20)
      .sort((a: any, b: any) => (a.predicted_margin || 0) - (b.predicted_margin || 0))
      .slice(0, 10)
      .map((f: any) => ({
        job_id: f.job_id,
        homeowner_name: f.jobs?.homeowner_name || "Unknown",
        predicted_profit: f.predicted_profit,
        predicted_margin: f.predicted_margin,
        contract_price: f.contract_price,
        predicted_total_cost: f.predicted_total_cost,
      }));

    return NextResponse.json({
      summary: {
        totalJobs: upcomingForecasts.length,
        totalProjectedRevenue,
        totalProjectedCost,
        totalProjectedProfit,
        avgProjectedMargin: Math.round(avgProjectedMargin * 10) / 10,
        riskBreakdown,
        marginBreakdown,
      },
      highRiskJobs,
      topProfitableJobs,
      lowMarginJobs,
      forecasts: upcomingForecasts.map((f: any) => ({
        id: f.id,
        job_id: f.job_id,
        homeowner_name: f.jobs?.homeowner_name,
        address: f.jobs?.address,
        predicted_profit: f.predicted_profit,
        predicted_margin: f.predicted_margin,
        risk_level: f.risk_level,
        risk_score: f.risk_score,
        confidence_score: f.confidence_score,
        production_date: f.jobs?.production_date,
      })),
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/forecasts/owner:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























