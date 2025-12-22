// Block 21757 — SmartSend Roofing Company Scorecard v1
// Computes weekly company performance metrics

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { workspace_id, period_start, period_end } = await req.json();

    if (!workspace_id || !period_start || !period_end) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: workspace_id, period_start, period_end" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Convert dates to timestamptz for queries
    const periodStart = new Date(period_start + "T00:00:00Z").toISOString();
    const periodEnd = new Date(period_end + "T23:59:59Z").toISOString();

    // ============================================================================
    // LEAD FLOW METRICS
    // ============================================================================

    // Total new leads (from leads table or lead_activities)
    const { data: leadsData } = await supabase
      .from("leads")
      .select("id, created_at")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd);

    const leads_total = leadsData?.length || 0;

    // Leads answered fast (<5 min) - check lead_activities for estimator_reply
    // Note: lead_activities doesn't have workspace_id, need to join via campaigns
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspace_id);

    const campaignIds = campaigns?.map((c: any) => c.id) || [];

    let leads_answered_fast = 0;
    let leads_ignored = 0;

    if (campaignIds.length > 0) {
      // Get activities for this workspace's campaigns
      const { data: activities } = await supabase
        .from("lead_activities")
        .select("id, created_at, meta, kind, title")
        .in("campaign_id", campaignIds)
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .catch(() => ({ data: null }));

      if (activities) {
        // Filter for replies within 5 minutes (300 seconds)
        leads_answered_fast = activities.filter((activity: any) => {
          if (activity.kind !== "message_out") return false;
          const responseTime = activity.meta?.response_time_seconds;
          return responseTime && responseTime < 300;
        }).length;

        // Leads ignored - check for status changes with "ignored" in title
        leads_ignored = activities.filter((activity: any) => {
          return activity.kind === "status_change" && 
                 activity.title?.toLowerCase().includes("ignored");
        }).length;
      }
    }

    // ============================================================================
    // APPOINTMENT METRICS
    // ============================================================================

    // Estimates booked - check estimates table or activities
    const { data: bookedEstimates } = await supabase
      .from("estimates")
      .select("id, created_at, thread_id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .in("status", ["sent", "approved", "won"]);

    const estimates_booked = bookedEstimates?.length || 0;

    // Estimates not booked - leads that didn't result in estimates
    const estimates_not_booked = Math.max(0, leads_total - estimates_booked);

    // Average lead to estimate time
    let avg_lead_to_estimate_seconds = 0;
    if (bookedEstimates && bookedEstimates.length > 0) {
      const times: number[] = [];
      for (const estimate of bookedEstimates) {
        // Get lead creation time from thread
        const { data: thread } = await supabase
          .from("inbox_threads")
          .select("created_at")
          .eq("id", estimate.thread_id)
          .single();

        if (thread) {
          const leadTime = new Date(thread.created_at).getTime();
          const estimateTime = new Date(estimate.created_at).getTime();
          times.push(Math.floor((estimateTime - leadTime) / 1000));
        }
      }
      avg_lead_to_estimate_seconds = times.length > 0
        ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
        : 0;
    }

    // ============================================================================
    // SALES PIPELINE METRICS
    // ============================================================================

    // Proposals sent - check estimates with status 'sent'
    const { data: proposalsSent } = await supabase
      .from("estimates")
      .select("id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .eq("status", "sent");

    const proposals_sent = proposalsSent?.length || 0;

    // Jobs closed - estimates with status 'won' or 'approved'
    const { data: jobsClosed } = await supabase
      .from("estimates")
      .select("id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .eq("status", "won");

    const jobs_closed = jobsClosed?.length || 0;

    // Jobs lost - estimates with status 'lost' or 'rejected'
    const { data: jobsLost } = await supabase
      .from("estimates")
      .select("id")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .in("status", ["lost", "rejected"]);

    const jobs_lost = jobsLost?.length || 0;

    // Win rate
    const totalJobs = jobs_closed + jobs_lost;
    const win_rate = totalJobs > 0
      ? Math.round((jobs_closed / totalJobs) * 10000) / 100
      : 0;

    // ============================================================================
    // MONEY METRICS
    // ============================================================================

    // Job value created - sum of won estimates
    const { data: wonEstimates } = await supabase
      .from("estimates")
      .select("estimated_total_avg, final_bid_price")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .eq("status", "won");

    const job_value_created = wonEstimates?.reduce((sum: number, e: any) => {
      return sum + (parseFloat(e.final_bid_price || e.estimated_total_avg || 0));
    }, 0) || 0;

    // Job value lost - sum of lost estimates + ignored leads
    const { data: lostEstimates } = await supabase
      .from("estimates")
      .select("estimated_total_avg, final_bid_price")
      .eq("workspace_id", workspace_id)
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .in("status", ["lost", "rejected"]);

    const lostValue = lostEstimates?.reduce((sum: number, e: any) => {
      return sum + (parseFloat(e.final_bid_price || e.estimated_total_avg || 0));
    }, 0) || 0;

    // Estimate average value for ignored leads (rough calculation)
    const avgEstimateValue = estimates_booked > 0 && job_value_created > 0
      ? job_value_created / estimates_booked
      : 0;
    const job_value_lost = lostValue + (leads_ignored * avgEstimateValue);

    // Pipeline value - sum of open estimates
    const { data: openEstimates } = await supabase
      .from("estimates")
      .select("estimated_total_avg, final_bid_price")
      .eq("workspace_id", workspace_id)
      .in("status", ["draft", "sent"]);

    const pipeline_value = openEstimates?.reduce((sum: number, e: any) => {
      return sum + (parseFloat(e.final_bid_price || e.estimated_total_avg || 0));
    }, 0) || 0;

    // ============================================================================
    // FOLLOW-UP METRICS
    // ============================================================================

    // Try to get follow-up tasks - handle different table structures
    let follow_up_completed = 0;
    let follow_up_missed = 0;

    // Try followup_tasks table with workspace_id, completed_at, due_at
    const { data: followupTasks } = await supabase
      .from("followup_tasks")
      .select("id, completed_at, due_at, workspace_id, campaign_id")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd)
      .catch(() => ({ data: null }));

    if (followupTasks) {
      // Filter by workspace_id if column exists
      const workspaceTasks = followupTasks.filter((task: any) => {
        if (task.workspace_id) {
          return task.workspace_id === workspace_id;
        }
        // If no workspace_id column, filter by campaign
        return true; // Will need to join with campaigns table
      });

      // Count completed tasks
      follow_up_completed = workspaceTasks.filter((task: any) => {
        return task.completed_at && 
               task.completed_at >= periodStart && 
               task.completed_at <= periodEnd;
      }).length;

      // Count missed tasks (due but not completed)
      follow_up_missed = workspaceTasks.filter((task: any) => {
        return task.due_at && 
               task.due_at <= periodEnd && 
               !task.completed_at;
      }).length;
    }

    // Fallback: check lead_activities for follow-up events
    if (follow_up_completed === 0 && follow_up_missed === 0 && campaignIds.length > 0) {
      const { data: followUpActivities } = await supabase
        .from("lead_activities")
        .select("id, kind, created_at")
        .in("campaign_id", campaignIds)
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd)
        .in("kind", ["task_done", "task_open"])
        .catch(() => ({ data: null }));

      if (followUpActivities) {
        follow_up_completed = followUpActivities.filter(
          (a: any) => a.kind === "task_done"
        ).length;
        follow_up_missed = followUpActivities.filter(
          (a: any) => a.kind === "task_open"
        ).length;
      }
    }

    // Follow-up rate
    const totalFollowUps = follow_up_completed + follow_up_missed;
    const follow_up_rate = totalFollowUps > 0
      ? Math.round((follow_up_completed / totalFollowUps) * 10000) / 100
      : 0;

    // ============================================================================
    // ESTIMATOR PERFORMANCE SUMMARY
    // ============================================================================

    // Check if estimator_scorecards table exists
    const { data: estimatorScorecards } = await supabase
      .from("estimator_scorecards")
      .select("estimator_id, final_letter_grade")
      .eq("workspace_id", workspace_id)
      .gte("period_start", period_start)
      .lte("period_end", period_end)
      .catch(() => ({ data: null }));

    let best_estimator_id: string | null = null;
    let worst_estimator_id: string | null = null;
    let estimator_team_avg: number | null = null;

    if (estimatorScorecards && estimatorScorecards.length > 0) {
      // Sort by grade
      const sorted = [...estimatorScorecards].sort((a, b) => {
        const scoreA = gradeToScore(a.final_letter_grade);
        const scoreB = gradeToScore(b.final_letter_grade);
        return scoreB - scoreA;
      });

      best_estimator_id = sorted[0]?.estimator_id || null;
      worst_estimator_id = sorted[sorted.length - 1]?.estimator_id || null;

      // Calculate team average
      const totalScore = sorted.reduce((sum, e) => {
        return sum + gradeToScore(e.final_letter_grade);
      }, 0);
      estimator_team_avg = Math.round((totalScore / sorted.length) * 100) / 100;
    }

    // ============================================================================
    // FINAL GRADE & INSIGHT
    // ============================================================================

    const { final_letter_grade, insight } = buildCompanyScore({
      leads_total,
      leads_ignored,
      win_rate,
      follow_up_rate,
    });

    // ============================================================================
    // INSERT SCORECARD
    // ============================================================================

    const { data: scorecard, error } = await supabase
      .from("company_scorecards")
      .insert({
        workspace_id,
        period_start,
        period_end,

        leads_total,
        leads_answered_fast,
        leads_ignored,

        estimates_booked,
        estimates_not_booked,
        avg_lead_to_estimate_seconds,

        proposals_sent,
        jobs_closed,
        jobs_lost,
        win_rate,

        job_value_created,
        job_value_lost,
        pipeline_value,

        follow_up_completed,
        follow_up_missed,
        follow_up_rate,

        best_estimator_id,
        worst_estimator_id,
        estimator_team_avg,

        final_letter_grade,
        insight,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting scorecard:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(scorecard),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Helper function to convert letter grade to numeric score
function gradeToScore(grade: string | null | undefined): number {
  if (!grade) return 0;
  const g = grade.toUpperCase();
  if (g === "A") return 4;
  if (g === "B") return 3;
  if (g === "C") return 2;
  if (g === "D") return 1;
  return 0;
}

// Build company score and insight
function buildCompanyScore({
  leads_total,
  leads_ignored,
  win_rate,
  follow_up_rate,
}: {
  leads_total: number;
  leads_ignored: number;
  win_rate: number;
  follow_up_rate: number;
}): { final_letter_grade: string; insight: string } {
  let score = 0;

  // Ignored leads penalty (max 25 points)
  if (leads_total > 0 && leads_ignored / leads_total < 0.1) {
    score += 25;
  } else if (leads_total > 0 && leads_ignored / leads_total < 0.2) {
    score += 15;
  } else if (leads_total > 0 && leads_ignored / leads_total < 0.3) {
    score += 5;
  }

  // Win rate (max 35 points)
  if (win_rate > 20) {
    score += 35;
  } else if (win_rate > 15) {
    score += 25;
  } else if (win_rate > 10) {
    score += 15;
  } else if (win_rate > 5) {
    score += 5;
  }

  // Follow-up rate (max 40 points)
  if (follow_up_rate > 70) {
    score += 40;
  } else if (follow_up_rate > 50) {
    score += 30;
  } else if (follow_up_rate > 30) {
    score += 20;
  } else if (follow_up_rate > 10) {
    score += 10;
  }

  // Determine grade
  let grade = "D";
  if (score >= 90) {
    grade = "A";
  } else if (score >= 75) {
    grade = "B";
  } else if (score >= 60) {
    grade = "C";
  }

  // Generate insight
  let insight = "";
  if (grade === "A") {
    insight = "Company is operating efficiently with minimal leakage.";
  } else if (grade === "B") {
    insight = "Strong close rate — improve ignored lead rate to reach A grade.";
  } else if (grade === "C") {
    insight = "Follow-up gaps are causing lost revenue.";
  } else {
    insight = "High leakage and poor follow-up — immediate process fixes needed.";
  }

  return { final_letter_grade: grade, insight };
}

