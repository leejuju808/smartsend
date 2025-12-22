// Block 24260 — SmartSend Roofing Pipeline Dashboard Metrics API
// GET /api/pipeline/roofing/metrics
// Returns pipeline dashboard metrics (counts, revenue, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get metrics from view
    const { data: metrics, error: metricsError } = await supabase
      .from("roofing_pipeline_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (metricsError && metricsError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine for new workspaces
      console.error("[Roofing Pipeline Metrics] Error:", metricsError);
      
      // Fallback: calculate manually
      const { data: leads } = await supabase
        .from("leads")
        .select("roofing_pipeline_stage, estimated_job_value, lead_status, installed_at")
        .eq("workspace_id", workspaceId);

      const manualMetrics = {
        leads_in_count: leads?.filter((l) => l.roofing_pipeline_stage === "lead_in").length || 0,
        inspections_set_count: leads?.filter((l) => l.roofing_pipeline_stage === "inspection_set").length || 0,
        quotes_sent_count: leads?.filter((l) => l.roofing_pipeline_stage === "quote_sent").length || 0,
        approved_count: leads?.filter((l) => l.roofing_pipeline_stage === "approved").length || 0,
        scheduled_count: leads?.filter((l) => l.roofing_pipeline_stage === "scheduled").length || 0,
        installed_count: leads?.filter((l) => l.roofing_pipeline_stage === "installed").length || 0,
        total_leads: leads?.length || 0,
        total_estimated_revenue: leads
          ?.filter((l) =>
            ["quote_sent", "approved", "scheduled", "installed"].includes(
              l.roofing_pipeline_stage || ""
            )
          )
          .reduce((sum, l) => sum + (Number(l.estimated_job_value) || 0), 0) || 0,
        revenue_won_this_month:
          leads
            ?.filter(
              (l) =>
                l.roofing_pipeline_stage === "installed" &&
                l.installed_at &&
                new Date(l.installed_at) >=
                  new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            )
            .reduce((sum, l) => sum + (Number(l.estimated_job_value) || 0), 0) || 0,
        hot_leads_count: leads?.filter((l) => l.lead_status === "HOT").length || 0,
        warm_leads_count: leads?.filter((l) => l.lead_status === "WARM").length || 0,
        cold_leads_count: leads?.filter((l) => l.lead_status === "COLD").length || 0,
      };

      return NextResponse.json(manualMetrics);
    }

    return NextResponse.json(metrics || {
      leads_in_count: 0,
      inspections_set_count: 0,
      quotes_sent_count: 0,
      approved_count: 0,
      scheduled_count: 0,
      installed_count: 0,
      total_leads: 0,
      total_estimated_revenue: 0,
      revenue_won_this_month: 0,
      hot_leads_count: 0,
      warm_leads_count: 0,
      cold_leads_count: 0,
    });
  } catch (error: any) {
    console.error("[Roofing Pipeline Metrics] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































