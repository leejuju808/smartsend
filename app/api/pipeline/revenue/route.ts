// Block 12500 — Roofer Project Pipeline v1
// GET /api/pipeline/revenue
// Get pipeline revenue summary for current workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get pipeline revenue summary
    const { data: summary, error: summaryError } = await supabase
      .from("pipeline_revenue_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    if (summaryError && summaryError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine for new workspaces
      console.error("[Pipeline] Revenue summary error:", summaryError);
    }

    // If no summary exists, calculate manually
    if (!summary) {
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("pipeline_stage, estimate_amount, job_value")
        .eq("workspace_id", workspaceId);

      if (contactsError) {
        return NextResponse.json(
          { error: "Failed to fetch contacts" },
          { status: 500 }
        );
      }

      const leadsCount = contacts?.filter(c => c.pipeline_stage === 'new_lead').length || 0;
      const inspectionsCount = contacts?.filter(c => c.pipeline_stage === 'inspection').length || 0;
      const estimatesCount = contacts?.filter(c => c.pipeline_stage === 'estimate_sent').length || 0;
      const totalEstimateValue = contacts
        ?.filter(c => c.pipeline_stage === 'estimate_sent' && c.estimate_amount)
        .reduce((sum, c) => sum + (parseFloat(c.estimate_amount as any) || 0), 0) || 0;
      const jobsWonCount = contacts?.filter(c => c.pipeline_stage === 'job_won').length || 0;
      const revenueWon = contacts
        ?.filter(c => c.pipeline_stage === 'job_won' && c.job_value)
        .reduce((sum, c) => sum + (parseFloat(c.job_value as any) || 0), 0) || 0;

      return NextResponse.json({
        leads_count: leadsCount,
        inspections_count: inspectionsCount,
        estimates_count: estimatesCount,
        total_estimate_value: totalEstimateValue,
        jobs_won_count: jobsWonCount,
        revenue_won: revenueWon,
      });
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[Pipeline] Revenue error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




























































