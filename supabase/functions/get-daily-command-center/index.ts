// Block 21878 — SmartSend Roofing Company Daily Command Center v1
// Edge Function — Get Daily Command Center Data
// Aggregates all critical business metrics into one dashboard

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: workspace_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    // ============================================================================
    // SECTION 1 — TODAY'S MONEY METRICS
    // ============================================================================

    // Get latest revenue forecast
    const { data: forecast } = await supabase
      .from("revenue_forecasts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .single();

    // Get today's leads
    const { data: leadsToday } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd);

    // Get today's job events (won/lost)
    const { data: jobEventsToday } = await supabase
      .from("job_timelines")
      .select("*")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd)
      .in("event_type", ["job_won", "job_lost"]);

    // Get leads for today's events
    const leadIds = jobEventsToday?.map(e => e.lead_id) || [];
    let wonToday: any[] = [];
    let lostToday: any[] = [];

    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .in("id", leadIds)
        .eq("workspace_id", workspace_id);

      wonToday = jobEventsToday
        ?.filter(e => e.event_type === "job_won")
        .map(e => leads?.find(l => l.id === e.lead_id))
        .filter(Boolean) || [];

      lostToday = jobEventsToday
        ?.filter(e => e.event_type === "job_lost")
        .map(e => leads?.find(l => l.id === e.lead_id))
        .filter(Boolean) || [];
    }

    // Calculate revenue leakage (lost jobs value)
    const revenueLeakageToday = lostToday.reduce((sum, lead) => {
      return sum + (lead?.estimated_job_value || lead?.proposal_amount || 0);
    }, 0);

    // Calculate expected closes today (from forecast or pipeline)
    const jobsExpectedToCloseToday = forecast?.install_probability 
      ? Math.round((forecast?.install_probability || 0) / 100 * (leadsToday?.length || 0))
      : 0;

    // ============================================================================
    // SECTION 2 — HOT LEADS THAT REQUIRE ACTION
    // ============================================================================

    // Hot leads (score 80-100)
    const { data: hotLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("heat_score", 80)
      .lte("heat_score", 100)
      .order("heat_score", { ascending: false })
      .limit(20);

    // Stuck leads (48+ hours without update)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const { data: allLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .neq("status", "won")
      .neq("status", "lost");

    const stuckLeads = (allLeads || []).filter(lead => {
      const updatedAt = new Date(lead.updated_at || lead.created_at);
      return updatedAt < twoDaysAgo;
    });

    // Leads with angry/impatient tone
    const { data: activities } = await supabase
      .from("lead_activities")
      .select("lead_id, homeowner_tone")
      .eq("workspace_id", workspace_id)
      .in("homeowner_tone", ["angry", "impatient"])
      .order("created_at", { ascending: false });

    const angryLeadIds = new Set(activities?.map(a => a.lead_id) || []);
    const { data: angryLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .in("id", Array.from(angryLeadIds))
      .limit(10);

    // High-value leads with low job probability
    const { data: highValueLowProbLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gt("estimated_job_value", 10000)
      .lt("job_probability", 30)
      .order("estimated_job_value", { ascending: false })
      .limit(10);

    // ============================================================================
    // SECTION 3 — ESTIMATOR PERFORMANCE SNAPSHOT
    // ============================================================================

    // Get all estimators for this workspace
    const { data: workspaceMembers } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspace_id);

    const estimatorIds = workspaceMembers?.map(wm => wm.user_id) || [];

    // Get today's estimator activities from job_timelines
    const { data: estimatorEventsToday } = await supabase
      .from("job_timelines")
      .select("*")
      .gte("created_at", todayStart)
      .lte("created_at", todayEnd)
      .in("event_type", ["estimator_reply", "follow_up_missed", "job_won", "job_lost"]);

    // Get estimator scorecards for today
    const { data: scorecards } = await supabase
      .from("estimator_scorecards")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("period_start", today)
      .lte("period_end", today);

    const estimatorSnapshots: Record<string, any> = {};

    // Process events to build snapshots
    estimatorEventsToday?.forEach(event => {
      const estimatorId = event.event_data?.estimator_id;
      if (!estimatorId) return;

      if (!estimatorSnapshots[estimatorId]) {
        estimatorSnapshots[estimatorId] = {
          estimator_id: estimatorId,
          response_times: [],
          missed_followups: 0,
          jobs_won: 0,
          jobs_lost: 0,
          hot_leads_assigned: 0,
        };
      }

      if (event.event_type === "estimator_reply") {
        const responseTime = event.event_data?.response_time;
        if (responseTime) {
          estimatorSnapshots[estimatorId].response_times.push(responseTime);
        }
      } else if (event.event_type === "follow_up_missed") {
        estimatorSnapshots[estimatorId].missed_followups++;
      } else if (event.event_type === "job_won") {
        estimatorSnapshots[estimatorId].jobs_won++;
      } else if (event.event_type === "job_lost") {
        estimatorSnapshots[estimatorId].jobs_lost++;
      }
    });

    // Get hot leads assigned to each estimator
    hotLeads?.forEach(lead => {
      if (lead.estimator_id && estimatorSnapshots[lead.estimator_id]) {
        estimatorSnapshots[lead.estimator_id].hot_leads_assigned++;
      }
    });

    // Calculate averages and performance badges
    Object.keys(estimatorSnapshots).forEach(estId => {
      const snap = estimatorSnapshots[estId];
      snap.avg_response_time_seconds = snap.response_times.length > 0
        ? Math.round(snap.response_times.reduce((a: number, b: number) => a + b, 0) / snap.response_times.length)
        : null;

      // Performance badge (A/B/C/D)
      let badge = "D";
      if (snap.missed_followups === 0 && snap.jobs_won > snap.jobs_lost && snap.avg_response_time_seconds && snap.avg_response_time_seconds < 3600) {
        badge = "A";
      } else if (snap.missed_followups <= 1 && snap.jobs_won >= snap.jobs_lost && snap.avg_response_time_seconds && snap.avg_response_time_seconds < 7200) {
        badge = "B";
      } else if (snap.missed_followups <= 2) {
        badge = "C";
      }
      snap.performance_badge = badge;
    });

    // Get estimator names
    if (Object.keys(estimatorSnapshots).length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Object.keys(estimatorSnapshots));

      profiles?.forEach(profile => {
        if (estimatorSnapshots[profile.id]) {
          estimatorSnapshots[profile.id].name = profile.full_name || profile.email || "Unknown";
        }
      });
    }

    // ============================================================================
    // SECTION 4 — CRITICAL ALERTS
    // ============================================================================

    const alerts: any[] = [];

    // Estimator overloaded (more than 10 hot leads)
    Object.entries(estimatorSnapshots).forEach(([estId, snap]: [string, any]) => {
      if (snap.hot_leads_assigned > 10) {
        alerts.push({
          type: "estimator_overloaded",
          severity: "high",
          message: `${snap.name || "Estimator"} has ${snap.hot_leads_assigned} hot leads assigned`,
          estimator_id: estId,
        });
      }
    });

    // High-value job at risk
    highValueLowProbLeads?.forEach(lead => {
      alerts.push({
        type: "high_value_at_risk",
        severity: "medium",
        message: `${lead.name || lead.email} - $${lead.estimated_job_value?.toLocaleString()} job at risk (${lead.job_probability || 0}% probability)`,
        lead_id: lead.id,
      });
    });

    // Missed follow-up on hot lead
    hotLeads?.forEach(lead => {
      const lastActivity = new Date(lead.updated_at || lead.created_at);
      const hoursSinceUpdate = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 24) {
        alerts.push({
          type: "missed_followup_hot_lead",
          severity: "high",
          message: `Hot lead ${lead.name || lead.email} hasn't been contacted in ${Math.round(hoursSinceUpdate)} hours`,
          lead_id: lead.id,
        });
      }
    });

    // Proposal overdue (leads in proposal stage for 7+ days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data: proposalLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "proposal_sent")
      .lt("updated_at", weekAgo.toISOString());

    proposalLeads?.forEach(lead => {
      alerts.push({
        type: "proposal_overdue",
        severity: "medium",
        message: `Proposal for ${lead.name || lead.email} sent ${Math.round((Date.now() - new Date(lead.updated_at).getTime()) / (1000 * 60 * 60 * 24))} days ago`,
        lead_id: lead.id,
      });
    });

    // Slow response on insurance job
    const { data: insuranceLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspace_id)
      .like("status", "%insurance%");

    insuranceLeads?.forEach(lead => {
      const lastActivity = new Date(lead.updated_at || lead.created_at);
      const hoursSinceUpdate = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 48) {
        alerts.push({
          type: "slow_response_insurance",
          severity: "high",
          message: `Insurance job for ${lead.name || lead.email} hasn't been updated in ${Math.round(hoursSinceUpdate)} hours`,
          lead_id: lead.id,
        });
      }
    });

    // Unknown homeowner tone (needs review)
    const { data: unknownToneLeads } = await supabase
      .from("lead_activities")
      .select("lead_id")
      .eq("workspace_id", workspace_id)
      .eq("kind", "message_in")
      .is("homeowner_tone", null)
      .order("created_at", { ascending: false })
      .limit(10);

    if (unknownToneLeads && unknownToneLeads.length > 0) {
      const leadIdsForTone = unknownToneLeads.map(a => a.lead_id);
      const { data: leadsNeedingTone } = await supabase
        .from("leads")
        .select("*")
        .in("id", leadIdsForTone)
        .eq("workspace_id", workspace_id);

      leadsNeedingTone?.forEach(lead => {
        alerts.push({
          type: "unknown_tone",
          severity: "low",
          message: `Homeowner tone for ${lead.name || lead.email} needs review`,
          lead_id: lead.id,
        });
      });
    }

    // ============================================================================
    // SECTION 5 — PIPELINE SUMMARY
    // ============================================================================

    const pipelineSummary: Record<string, number> = {};
    const pipelineWeightedValue: Record<string, number> = {};
    const pipelineBestCaseValue: Record<string, number> = {};
    let jobsStuck48Hours = 0;

    allLeads?.forEach(lead => {
      const status = lead.status || "new_lead";
      pipelineSummary[status] = (pipelineSummary[status] || 0) + 1;

      const jobValue = lead.estimated_job_value || lead.proposal_amount || 0;
      const probability = lead.job_probability || 0;

      // Weighted value (value * probability)
      pipelineWeightedValue[status] = (pipelineWeightedValue[status] || 0) + (jobValue * probability / 100);

      // Best-case value (full value)
      pipelineBestCaseValue[status] = (pipelineBestCaseValue[status] || 0) + jobValue;

      // Check if stuck
      const updatedAt = new Date(lead.updated_at || lead.created_at);
      if (updatedAt < twoDaysAgo) {
        jobsStuck48Hours++;
      }
    });

    const totalPipelineWeightedValue = Object.values(pipelineWeightedValue).reduce((a, b) => a + b, 0);
    const totalPipelineBestCaseValue = Object.values(pipelineBestCaseValue).reduce((a, b) => a + b, 0);

    // ============================================================================
    // SECTION 6 — AI-PRODUCED DAILY INSIGHT
    // ============================================================================

    const recommendation = buildRecommendation(
      hotLeads || [],
      stuckLeads || [],
      forecast,
      highValueLowProbLeads || []
    );

    // ============================================================================
    // RETURN COMPLETE DATA STRUCTURE
    // ============================================================================

    return new Response(
      JSON.stringify({
        today: {
          revenue_forecast: forecast?.true_job_value || 0,
          jobs_expected_to_close: jobsExpectedToCloseToday,
          new_leads: leadsToday?.length || 0,
          jobs_won: wonToday.length,
          jobs_lost: lostToday.length,
          revenue_leakage: revenueLeakageToday,
        },
        hot_leads: hotLeads || [],
        stuck_leads: stuckLeads.slice(0, 10),
        angry_leads: angryLeads || [],
        high_value_low_prob_leads: highValueLowProbLeads || [],
        estimator_snapshots: Object.values(estimatorSnapshots),
        alerts: alerts.slice(0, 20), // Limit to top 20 alerts
        pipeline_summary: {
          counts: pipelineSummary,
          weighted_value: totalPipelineWeightedValue,
          best_case_value: totalPipelineBestCaseValue,
          jobs_stuck_48h: jobsStuck48Hours,
        },
        recommendation,
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error) {
    console.error("get-daily-command-center error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});

function buildRecommendation(
  hotLeads: any[],
  stuckLeads: any[],
  forecast: any,
  highValueLowProbLeads: any[]
): string {
  if (stuckLeads.length > 0) {
    const highProbStuck = stuckLeads.filter(l => (l.job_probability || 0) > 50);
    if (highProbStuck.length > 0) {
      const value = highProbStuck.reduce((sum, l) => sum + (l.estimated_job_value || l.proposal_amount || 0), 0);
      return `If you contact the ${highProbStuck.length} high-probability leads stuck in pipeline, your forecast may increase by $${value.toLocaleString()}.`;
    }
  }

  if (highValueLowProbLeads.length > 0) {
    const totalValue = highValueLowProbLeads.reduce((sum, l) => sum + (l.estimated_job_value || 0), 0);
    return `You have ${highValueLowProbLeads.length} high-value jobs ($${totalValue.toLocaleString()}) with low probability. These need immediate attention to prevent revenue loss.`;
  }

  if (hotLeads.length > 0) {
    return `You have ${hotLeads.length} hot leads ready to close. Prioritize these first to improve closing rate.`;
  }

  return "Your pipeline is stable. Focus on following up with decision-pending leads.";
}









































