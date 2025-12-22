import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { getOutreachSnapshot } from "@/lib/outreach/snapshot";

/**
 * GET /api/analytics/ceo-dashboard/forecast?days=90
 * 
 * Returns revenue forecast for next X days (default 90)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const outreach = await getOutreachSnapshot(workspace_id);
    if (outreach.state !== "running") {
      return NextResponse.json(
        {
          disabled: true,
          message: "No system running.",
          smartsend: outreach,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "90", 10);
    const supabase = await getServerSupabase();

    // Get revenue forecast
    const { data: forecast, error } = await supabase
      .from("revenue_forecast")
      .select("*")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching forecast:", error);
      return NextResponse.json(
        { error: "Failed to fetch revenue forecast" },
        { status: 500 }
      );
    }

    // Get scheduled jobs for detailed breakdown
    const { data: scheduledJobs } = await supabase
      .from("roofing_jobs")
      .select("id, job_value, scheduled_start_date, status")
      .eq("workspace_id", workspace_id)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("status", ["scheduled", "in_progress", "approved", "signed"])
      .gte("scheduled_start_date", new Date().toISOString().split("T")[0])
      .lte("scheduled_start_date", new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("scheduled_start_date", { ascending: true });

    // Get signed but not scheduled jobs
    const { data: pendingJobs } = await supabase
      .from("roofing_jobs")
      .select("id, job_value, status")
      .eq("workspace_id", workspace_id)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("status", ["signed", "approved"])
      .is("scheduled_start_date", null);

    // Get estimates (weighted probability)
    const { data: estimates } = await supabase
      .from("leads")
      .select("id, projected_job_value")
      .eq("workspace_id", workspace_id)
      .in("status", ["estimate_sent", "quote_sent"]);

    // Calculate material cost estimate (if available)
    const { data: materialCosts } = await supabase
      .from("roofing_jobs")
      .select("est_material_cost, actual_material_cost")
      .eq("workspace_id", workspace_id)
      // Block 272600: Only SmartSend-origin jobs count
      .eq("origin_source", "smartsend")
      .in("status", ["scheduled", "in_progress", "approved", "signed"]);

    const estimatedMaterialCost = materialCosts?.reduce(
      (sum: number, job: any) => sum + Number(job.est_material_cost || job.actual_material_cost || 0),
      0
    ) || 0;

    // Build forecast breakdown
    const forecast30d = Number(forecast?.forecast_30d || 0) + Number(forecast?.pending_signed_revenue || 0);
    const forecast60d = Number(forecast?.forecast_60d || 0) + Number(forecast?.pending_signed_revenue || 0);
    const forecast90d = Number(forecast?.forecast_90d || 0) + Number(forecast?.pending_signed_revenue || 0) + Number(forecast?.estimated_pipeline_revenue || 0);

    return NextResponse.json({
      smartsend: outreach,
      forecast: {
        next30Days: {
          revenue: forecast30d,
          jobs: Number(forecast?.jobs_30d || 0),
          materialCostEstimate: estimatedMaterialCost * 0.33, // Rough estimate for 30 days
        },
        next60Days: {
          revenue: forecast60d,
          jobs: Number(forecast?.jobs_60d || 0),
          materialCostEstimate: estimatedMaterialCost * 0.66,
        },
        next90Days: {
          revenue: forecast90d,
          jobs: Number(forecast?.jobs_90d || 0),
          materialCostEstimate: estimatedMaterialCost,
        },
      },
      breakdown: {
        scheduledRevenue:
          (scheduledJobs ?? []).reduce((sum: number, job: any) => sum + Number(job.job_value || 0), 0) || 0,
        pendingSignedRevenue: Number(forecast?.pending_signed_revenue || 0),
        estimatedPipelineRevenue: Number(forecast?.estimated_pipeline_revenue || 0),
        scheduledJobs: scheduledJobs?.length || 0,
        pendingJobs: pendingJobs?.length || 0,
        activeEstimates: estimates?.length || 0,
      },
      scheduledJobs: (scheduledJobs || []).map((job: any) => ({
        jobId: job.id,
        value: Number(job.job_value || 0),
        scheduledDate: job.scheduled_start_date,
        status: job.status,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching forecast:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch forecast" },
      { status: 500 }
    );
  }
}
























