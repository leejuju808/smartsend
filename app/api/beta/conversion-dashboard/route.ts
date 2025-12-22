// Block 10100 — Conversion Dashboard API
// GET /api/beta/conversion-dashboard?beta_tester_id=xxx
// Returns the "Holy Shit" dashboard metrics for a beta tester

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const supabaseAdmin = createSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const beta_tester_id = searchParams.get("beta_tester_id");

    if (!beta_tester_id) {
      return NextResponse.json(
        { error: "beta_tester_id is required" },
        { status: 400 }
      );
    }

    // Get metrics from beta_conversion_dashboard view
    const { data: dashboard, error } = await supabaseAdmin
      .from("beta_conversion_dashboard")
      .select("*")
      .eq("beta_tester_id", beta_tester_id)
      .single();

    if (error) {
      // If view doesn't exist or returns no data, calculate manually
      const { data: betaTester } = await supabaseAdmin
        .from("beta_testers")
        .select("workspace_id, first_campaign_launched_at, first_homeowner_reply_at")
        .eq("id", beta_tester_id)
        .single();

      if (!betaTester || !betaTester.workspace_id) {
        return NextResponse.json({
          metrics: {
            emails_sent: 0,
            replies_received: 0,
            hot_leads: 0,
            leads_with_estimates: 0,
            estimated_job_value: 0,
            hours_to_first_reply: null,
            conversion_stage: "not_started",
          },
        });
      }

      // Calculate metrics manually
      const { data: campaigns } = await supabaseAdmin
        .from("campaigns")
        .select("id")
        .eq("workspace_id", betaTester.workspace_id);

      let emailsSent = 0;
      let repliesReceived = 0;
      let hotLeads = 0;
      let leadsWithEstimates = 0;
      let estimatedJobValue = 0;

      if (campaigns && campaigns.length > 0) {
        const campaignIds = campaigns.map((c) => c.id);

        // Get stats from lead_auto_follow_up_stats
        const { data: stats } = await supabaseAdmin
          .from("lead_auto_follow_up_stats")
          .select("lead_id, lead_status, pipeline_stage, potential_job_value")
          .in("campaign_id", campaignIds);

        if (stats) {
          emailsSent = stats.length;
          repliesReceived = stats.filter(
            (s) => s.lead_status === "replied"
          ).length;
          hotLeads = stats.filter((s) => s.lead_status === "hot").length;
          leadsWithEstimates = stats.filter(
            (s) => s.pipeline_stage && ["estimate_booked", "won"].includes(s.pipeline_stage)
          ).length;
          estimatedJobValue = stats
            .filter(
              (s) =>
                s.lead_status &&
                ["hot", "warm"].includes(s.lead_status) &&
                s.potential_job_value
            )
            .reduce(
              (sum, s) => sum + Number(s.potential_job_value || 0),
              0
            );
        }
      }

      // Calculate hours to first reply
      let hoursToFirstReply: number | null = null;
      if (
        betaTester.first_homeowner_reply_at &&
        betaTester.first_campaign_launched_at
      ) {
        const replyTime = new Date(betaTester.first_homeowner_reply_at).getTime();
        const launchTime = new Date(
          betaTester.first_campaign_launched_at
        ).getTime();
        hoursToFirstReply = (replyTime - launchTime) / (1000 * 60 * 60);
      }

      // Determine conversion stage
      let conversionStage = "not_started";
      if (betaTester.first_campaign_launched_at) {
        conversionStage = "campaign_running";
        if (betaTester.first_homeowner_reply_at) {
          conversionStage = "ready_for_conversion";
        }
      }

      return NextResponse.json({
        metrics: {
          emails_sent: emailsSent,
          replies_received: repliesReceived,
          hot_leads: hotLeads,
          leads_with_estimates: leadsWithEstimates,
          estimated_job_value: estimatedJobValue,
          hours_to_first_reply: hoursToFirstReply,
          conversion_stage: conversionStage,
        },
      });
    }

    // Return data from view
    return NextResponse.json({
      metrics: {
        emails_sent: dashboard.emails_sent || 0,
        replies_received: dashboard.replies_received || 0,
        hot_leads: dashboard.hot_leads || 0,
        leads_with_estimates: dashboard.leads_with_estimates || 0,
        estimated_job_value: Number(dashboard.estimated_job_value || 0),
        hours_to_first_reply: dashboard.hours_to_first_reply
          ? Number(dashboard.hours_to_first_reply)
          : null,
        conversion_stage: dashboard.conversion_stage || "not_started",
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/beta/conversion-dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























































