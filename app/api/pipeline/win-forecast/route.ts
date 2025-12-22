// Block 22192 — SmartSend Roofing Win Probability Engine v1
// GET /api/pipeline/win-forecast
// Returns projected revenue from current pipeline based on win probability

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const url = new URL(req.url);
    const workspaceIdParam = url.searchParams.get("workspace_id");
    
    const workspaceId = workspaceIdParam || await getCurrentWorkspaceId();

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

    // Fetch leads grouped by pipeline stage with win probability and estimated value
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        pipeline_stage,
        estimated_job_value,
        win_probability
      `)
      .eq("workspace_id", workspaceId)
      .not("pipeline_stage", "is", null)
      .not("win_probability", "is", null);

    if (leadsError) {
      console.error("[Win Forecast] Error fetching leads:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ stages: [] });
    }

    // Group by stage and calculate weighted values
    const stageGroups: Record<string, {
      stage: string;
      value: number;
      avgWinProb: number;
      weightedValue: number;
      count: number;
    }> = {};

    leads.forEach((lead) => {
      const stage = lead.pipeline_stage || "unknown";
      const value = lead.estimated_job_value || 0;
      const winProb = lead.win_probability || 50; // Default to 50% if not calculated
      
      if (!stageGroups[stage]) {
        stageGroups[stage] = {
          stage,
          value: 0,
          avgWinProb: 0,
          weightedValue: 0,
          count: 0,
        };
      }

      stageGroups[stage].value += value;
      stageGroups[stage].weightedValue += value * (winProb / 100);
      stageGroups[stage].count += 1;
    });

    // Calculate average win probability per stage
    Object.values(stageGroups).forEach((group) => {
      if (group.count > 0) {
        // Get average from weighted average calculation
        const totalValue = group.value;
        const totalWeighted = group.weightedValue;
        group.avgWinProb = totalValue > 0 
          ? Math.round((totalWeighted / totalValue) * 100)
          : 0;
      }
    });

    const stages = Object.values(stageGroups).map((group) => ({
      stage: group.stage.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      value: Math.round(group.value),
      avgWinProb: group.avgWinProb,
      weightedValue: Math.round(group.weightedValue),
      count: group.count,
    }));

    return NextResponse.json({ stages });
  } catch (error: any) {
    console.error("[Win Forecast] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
