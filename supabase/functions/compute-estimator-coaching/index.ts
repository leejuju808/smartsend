// Block 21812 — SmartSend Roofing Estimator Coaching Engine v1
// Edge function to generate weekly coaching insights for estimators
// Analyzes performance metrics and generates actionable coaching feedback

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CoachingInput {
  estimator_id: string;
  workspace_id: string;
  week_start: string; // ISO date string
  week_end: string; // ISO date string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const input: CoachingInput = await req.json();

    if (!input.estimator_id || !input.workspace_id || !input.week_start || !input.week_end) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: estimator_id, workspace_id, week_start, week_end" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Estimator Coaching] Computing for estimator ${input.estimator_id}, week ${input.week_start} to ${input.week_end}`);

    const weekStart = new Date(input.week_start);
    const weekEnd = new Date(input.week_end);

    // ============================================================================
    // 1. FETCH SCORECARD FOR THIS WEEK
    // ============================================================================
    const { data: scorecard, error: scorecardError } = await supabase
      .from("estimator_scorecards")
      .select("*")
      .eq("estimator_id", input.estimator_id)
      .eq("workspace_id", input.workspace_id)
      .eq("period_start", input.week_start)
      .eq("period_end", input.week_end)
      .single();

    if (scorecardError && scorecardError.code !== "PGRST116") {
      console.error("Error fetching scorecard:", scorecardError);
      throw scorecardError;
    }

    // If no scorecard exists, we can still generate coaching from raw data
    if (!scorecard) {
      console.log("No scorecard found, generating coaching from raw data");
    }

    // ============================================================================
    // 2. FETCH ACTIVITY DATA FOR DEEPER INSIGHTS
    // ============================================================================
    // Get campaigns for this workspace
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", input.workspace_id);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      throw campaignsError;
    }

    const campaignIds = (campaigns || []).map((c) => c.id);

    if (campaignIds.length === 0) {
      // No campaigns, return empty coaching report
      const emptyReport = {
        estimator_id: input.estimator_id,
        workspace_id: input.workspace_id,
        week_start: input.week_start,
        week_end: input.week_end,
        summary: "No activity during this period.",
        strengths: "",
        weaknesses: "",
        action_items: "",
        opportunity: "",
      };

      const { data: inserted, error: insertError } = await supabase
        .from("estimator_coaching_reports")
        .upsert(emptyReport, { onConflict: "estimator_id,workspace_id,week_start,week_end" })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return new Response(JSON.stringify(inserted), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get threads assigned to this estimator
    const { data: threads, error: threadsError } = await supabase
      .from("inbox_threads")
      .select("id, lead_id, campaign_id, assigned_to, last_message_at")
      .eq("assigned_to", input.estimator_id)
      .in("campaign_id", campaignIds)
      .gte("last_message_at", input.week_start)
      .lte("last_message_at", input.week_end);

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      throw threadsError;
    }

    const threadIds = (threads || []).map((t) => t.id);

    // ============================================================================
    // 3. ANALYZE FOLLOW-UP ACTIVITY
    // ============================================================================
    const { data: tasks, error: tasksError } = await supabase
      .from("smartsend_tasks")
      .select("id, completed, completed_at, due_at, status")
      .eq("user_id", input.estimator_id)
      .eq("workspace_id", input.workspace_id)
      .gte("due_at", input.week_start)
      .lte("due_at", input.week_end);

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
    }

    const totalTasks = (tasks || []).length;
    const completedTasks = (tasks || []).filter((t) => t.completed || t.status === "completed").length;
    const missedTasks = totalTasks - completedTasks;

    // ============================================================================
    // 4. ANALYZE WINS AND LOSSES
    // ============================================================================
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select("id, thread_id, status")
      .in("thread_id", threadIds)
      .eq("workspace_id", input.workspace_id)
      .gte("created_at", input.week_start)
      .lte("created_at", input.week_end);

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
    }

    const wins = (proposals || []).filter((p) => p.status === "won").length;
    const losses = (proposals || []).filter((p) => p.status === "lost").length;
    const totalProposals = wins + losses;

    // ============================================================================
    // 5. GET COMPANY AVERAGE FOR COMPARISON
    // ============================================================================
    const { data: companyScorecard, error: companyError } = await supabase
      .from("company_scorecards")
      .select("win_rate")
      .eq("workspace_id", input.workspace_id)
      .eq("period_start", input.week_start)
      .eq("period_end", input.week_end)
      .single();

    const companyAvgWinRate = companyScorecard?.win_rate || null;

    // ============================================================================
    // 6. BUILD COACHING INSIGHTS
    // ============================================================================
    const summary = buildSummary(scorecard, wins, losses, totalProposals, companyAvgWinRate);
    const strengths = buildStrengths(scorecard, completedTasks, wins);
    const weaknesses = buildWeaknesses(scorecard, missedTasks, losses);
    const actionItems = buildActionItems(scorecard, missedTasks);
    const opportunity = buildOpportunities(scorecard, wins, losses);

    // ============================================================================
    // 7. INSERT/UPSERT COACHING REPORT
    // ============================================================================
    const coachingReport = {
      estimator_id: input.estimator_id,
      workspace_id: input.workspace_id,
      week_start: input.week_start,
      week_end: input.week_end,
      summary,
      strengths,
      weaknesses,
      action_items: actionItems,
      opportunity,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("estimator_coaching_reports")
      .upsert(coachingReport, {
        onConflict: "estimator_id,workspace_id,week_start,week_end",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting coaching report:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify(inserted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Estimator Coaching] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildSummary(
  scorecard: any,
  wins: number,
  losses: number,
  totalProposals: number,
  companyAvgWinRate: number | null
): string {
  if (!scorecard && totalProposals === 0) {
    return "No activity during this period. Focus on engaging with leads to generate opportunities.";
  }

  const winRate = totalProposals > 0 ? (wins / totalProposals) * 100 : 0;
  const winRateStr = winRate.toFixed(1);

  if (companyAvgWinRate !== null) {
    const comparison = winRate > companyAvgWinRate ? "above" : "below";
    return `Your win rate this week was ${winRateStr}%, ${comparison} the company average of ${companyAvgWinRate.toFixed(1)}%. Overall grade: ${scorecard?.final_letter_grade || "N/A"}.`;
  }

  return `Your win rate this week was ${winRateStr}%. Overall grade: ${scorecard?.final_letter_grade || "N/A"}.`;
}

function buildStrengths(scorecard: any, completedTasks: number, wins: number): string {
  const parts: string[] = [];

  if (scorecard?.avg_response_time_seconds && scorecard.avg_response_time_seconds < 300) {
    parts.push("Fast response time — strong priority handling.");
  }

  if (completedTasks > 5) {
    parts.push("You completed follow-ups consistently.");
  }

  if (scorecard?.win_rate && scorecard.win_rate > 20) {
    parts.push("Above-average close rate.");
  }

  if (scorecard?.lead_coverage_score && scorecard.lead_coverage_score > 60) {
    parts.push("Excellent lead coverage — responding quickly to homeowner inquiries.");
  }

  if (wins > 3) {
    parts.push(`Strong closing performance with ${wins} wins this week.`);
  }

  if (parts.length === 0) {
    return "Keep focusing on consistent follow-up and quick response times.";
  }

  return parts.join(" ");
}

function buildWeaknesses(scorecard: any, missedTasks: number, losses: number): string {
  const parts: string[] = [];

  if (scorecard?.avg_response_time_seconds && scorecard.avg_response_time_seconds > 900) {
    parts.push("Slow response times are costing opportunities.");
  }

  if (missedTasks > 0) {
    const estimatedLoss = missedTasks * 3500; // Rough estimate: $3,500 per missed follow-up
    parts.push(`You missed ${missedTasks} follow-up${missedTasks > 1 ? "s" : ""} this week. This likely cost $${estimatedLoss.toLocaleString()} in job value.`);
  }

  if (scorecard?.job_value_lost && scorecard.job_value_lost > 5000) {
    parts.push(`High revenue leakage detected: $${scorecard.job_value_lost.toLocaleString()} in lost job value.`);
  }

  if (scorecard?.follow_up_completion_rate && scorecard.follow_up_completion_rate < 50) {
    parts.push("Follow-up completion rate is below 50% — this is impacting your close rate.");
  }

  if (losses > wins && losses > 2) {
    parts.push(`More losses (${losses}) than wins (${wins}) — focus on improving proposal quality and follow-up timing.`);
  }

  if (parts.length === 0) {
    return "No major weaknesses detected this week. Keep up the good work!";
  }

  return parts.join(" ");
}

function buildActionItems(scorecard: any, missedTasks: number): string {
  const items: string[] = [];

  if (scorecard?.avg_response_time_seconds && scorecard.avg_response_time_seconds > 300) {
    items.push("Respond to all leads within 5 minutes.");
  }

  if (missedTasks > 0) {
    items.push("Complete all follow-ups before noon each day.");
  }

  if (scorecard?.proposal_sent_rate && scorecard.proposal_sent_rate < 50) {
    items.push("Send proposals within 24 hours of estimate completion.");
  }

  if (scorecard?.win_rate && scorecard.win_rate < 15) {
    items.push("Focus on improving proposal quality and homeowner communication.");
  }

  if (scorecard?.lead_coverage_score && scorecard.lead_coverage_score < 50) {
    items.push("Prioritize responding to hot leads within 3 minutes.");
  }

  if (items.length === 0) {
    items.push("Maintain current performance levels.");
    items.push("Continue prioritizing fast response times.");
    items.push("Keep completing follow-ups on schedule.");
  }

  return items.slice(0, 3).join("\n");
}

function buildOpportunities(scorecard: any, wins: number, losses: number): string {
  if (scorecard?.win_rate && scorecard.win_rate > 30) {
    return "You close strongly — request more high-value jobs.";
  }

  if (scorecard?.avg_response_time_seconds && scorecard.avg_response_time_seconds < 200) {
    return "Great speed — prioritize hot leads to maximize conversion.";
  }

  if (wins > losses && wins > 3) {
    return "Strong closing performance — focus on insurance and emergency leads next week.";
  }

  if (scorecard?.lead_coverage_score && scorecard.lead_coverage_score > 70) {
    return "Excellent lead coverage — request more high-intent leads.";
  }

  return "Focus on insurance and emergency leads next week.";
}









































