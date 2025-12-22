// GET /api/workforce/jobs/[jobId]/forecast - Get job cost forecast
// POST /api/workforce/jobs/[jobId]/forecast - Generate/regenerate job cost forecast

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

    const { jobId } = await params;

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Get forecast with risk factors
    const { data: forecast, error: forecastError } = await supabase
      .from("job_cost_forecasts")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (forecastError && forecastError.code !== 'PGRST116') { // PGRST116 = not found
      console.error("Error fetching forecast:", forecastError);
      return NextResponse.json(
        { error: forecastError.message },
        { status: 500 }
      );
    }

    // Get risk factors if forecast exists
    let riskFactors = [];
    if (forecast) {
      const { data: factors, error: factorsError } = await supabase
        .from("job_risk_factors")
        .select("*")
        .eq("forecast_id", forecast.id)
        .order("severity", { ascending: false });

      if (!factorsError) {
        riskFactors = factors || [];
      }
    }

    return NextResponse.json({
      forecast: forecast || null,
      riskFactors: riskFactors,
    });
  } catch (error: any) {
    console.error("Error in GET /api/workforce/jobs/[jobId]/forecast:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
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

    const { jobId } = await params;

    // Verify job belongs to company
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, company_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.company_id !== companyId) {
      return NextResponse.json(
        { error: "You don't have access to this job" },
        { status: 403 }
      );
    }

    // Generate forecast using database function
    const { data: forecastId, error: generateError } = await supabase.rpc(
      "generate_job_cost_forecast",
      {
        p_job_id: jobId,
        p_company_id: companyId,
      }
    );

    if (generateError) {
      console.error("Error generating forecast:", generateError);
      return NextResponse.json(
        { error: generateError.message },
        { status: 500 }
      );
    }

    // Fetch the generated forecast
    const { data: forecast, error: fetchError } = await supabase
      .from("job_cost_forecasts")
      .select("*")
      .eq("id", forecastId)
      .single();

    if (fetchError) {
      console.error("Error fetching generated forecast:", fetchError);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    // Get risk factors
    const { data: riskFactors, error: factorsError } = await supabase
      .from("job_risk_factors")
      .select("*")
      .eq("forecast_id", forecastId)
      .order("severity", { ascending: false });

    return NextResponse.json({
      forecast: forecast,
      riskFactors: riskFactors || [],
    });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/jobs/[jobId]/forecast:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
























