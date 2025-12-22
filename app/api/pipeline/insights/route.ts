// Block 14000 — SmartSend Pipeline Board API
// GET /api/pipeline/insights
// Returns pipeline metrics and insights

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

    // Get counts by pipeline stage
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, pipeline_stage, lead_score")
      .eq("workspace_id", workspaceId);

    const stageCounts: Record<string, number> = {
      HOT: 0,
      WARM: 0,
      FOLLOW_UP: 0,
      COLD: 0,
      NOT_INTERESTED: 0,
    };

    let totalScore = 0;
    let totalValue = 0;
    let hotLeads = 0;
    let hotWon = 0;

    (contacts || []).forEach((contact: any) => {
      const stage = contact.pipeline_stage || "COLD";
      if (stageCounts.hasOwnProperty(stage)) {
        stageCounts[stage]++;
      } else {
        stageCounts.COLD++;
      }

      const score = contact.lead_score || 0;
      totalScore += score;

      // Count HOT leads
      if (stage === "HOT" || score >= 70) {
        hotLeads++;
      }
    });

    // Get potential job values from lead_auto_follow_up_stats
    const { data: stats } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("potential_job_value, pipeline_stage")
      .in("contact_id", (contacts || []).map((c: any) => c.id));

    (stats || []).forEach((stat: any) => {
      if (stat.potential_job_value) {
        totalValue += parseFloat(stat.potential_job_value);
      }
      if (stat.pipeline_stage === "won") {
        hotWon++;
      }
    });

    const totalLeads = contacts?.length || 0;
    const avgLeadScore =
      totalLeads > 0 ? Math.round(totalScore / totalLeads) : 0;
    const hotConversionRate =
      hotLeads > 0 ? Math.round((hotWon / hotLeads) * 100) : 0;

    return NextResponse.json({
      stage_counts: stageCounts,
      total_leads: totalLeads,
      average_lead_score: avgLeadScore,
      estimated_revenue: Math.round(totalValue),
      hot_leads: hotLeads,
      hot_conversion_rate: hotConversionRate,
    });
  } catch (error: any) {
    console.error("[Pipeline Insights] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

