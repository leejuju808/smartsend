// Block 21746 — SmartSend Roofing Estimator Scorecard v1
// Edge function to compute estimator performance metrics and generate scorecards

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScorecardInput {
  estimator_id: string;
  workspace_id: string;
  period_start: string; // ISO date string
  period_end: string; // ISO date string
}

interface ScorecardMetrics {
  avg_response_time_seconds: number | null;
  follow_up_completion_rate: number | null;
  booked_estimate_rate: number | null;
  proposal_sent_rate: number | null;
  win_rate: number | null;
  job_value_created: number;
  job_value_lost: number;
  lead_coverage_score: number | null;
  final_letter_grade: string;
  insight: string;
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
    const input: ScorecardInput = await req.json();

    if (!input.estimator_id || !input.workspace_id || !input.period_start || !input.period_end) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: estimator_id, workspace_id, period_start, period_end" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Estimator Scorecard] Computing for estimator ${input.estimator_id}, period ${input.period_start} to ${input.period_end}`);

    const periodStart = new Date(input.period_start);
    const periodEnd = new Date(input.period_end);

    // ============================================================================
    // 1. GET RELEVANT THREADS ASSIGNED TO THIS ESTIMATOR
    // Filter by workspace through campaigns
    // ============================================================================
    // First get campaigns for this workspace
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
      // No campaigns, return empty scorecard
      const emptyScorecard = {
        estimator_id: input.estimator_id,
        workspace_id: input.workspace_id,
        period_start: input.period_start,
        period_end: input.period_end,
        avg_response_time_seconds: null,
        follow_up_completion_rate: null,
        booked_estimate_rate: null,
        proposal_sent_rate: null,
        win_rate: null,
        job_value_created: 0,
        job_value_lost: 0,
        lead_coverage_score: null,
        final_letter_grade: "F",
        insight: "No campaigns found for this workspace.",
      };

      const { data: inserted, error: insertError } = await supabase
        .from("estimator_scorecards")
        .upsert(emptyScorecard, { onConflict: "estimator_id,workspace_id,period_start,period_end" })
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

    const { data: threads, error: threadsError } = await supabase
      .from("inbox_threads")
      .select("id, lead_id, campaign_id, assigned_to, last_message_at")
      .eq("assigned_to", input.estimator_id)
      .in("campaign_id", campaignIds)
      .gte("last_message_at", input.period_start)
      .lte("last_message_at", input.period_end);

    if (threadsError) {
      console.error("Error fetching threads:", threadsError);
      throw threadsError;
    }

    const threadIds = (threads || []).map((t) => t.id);
    const leadIds = (threads || []).map((t) => t.lead_id).filter(Boolean);

    if (threadIds.length === 0) {
      // No activity, return empty scorecard
      const emptyScorecard = {
        estimator_id: input.estimator_id,
        workspace_id: input.workspace_id,
        period_start: input.period_start,
        period_end: input.period_end,
        avg_response_time_seconds: null,
        follow_up_completion_rate: null,
        booked_estimate_rate: null,
        proposal_sent_rate: null,
        win_rate: null,
        job_value_created: 0,
        job_value_lost: 0,
        lead_coverage_score: null,
        final_letter_grade: "F",
        insight: "No activity during this period.",
      };

      const { data: inserted, error: insertError } = await supabase
        .from("estimator_scorecards")
        .upsert(emptyScorecard, { onConflict: "estimator_id,workspace_id,period_start,period_end" })
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

    // ============================================================================
    // 2. COMPUTE RESPONSE TIME (homeowner reply → estimator response)
    // ============================================================================
    const { data: messages, error: messagesError } = await supabase
      .from("inbox_messages")
      .select("id, thread_id, direction, sent_at, received_at")
      .in("thread_id", threadIds)
      .gte("sent_at", input.period_start)
      .lte("sent_at", input.period_end)
      .order("thread_id", { ascending: true })
      .order("sent_at", { ascending: true });

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      throw messagesError;
    }

    const responseTimes: number[] = [];
    const messagesByThread = new Map<string, typeof messages>();

    (messages || []).forEach((msg) => {
      if (!messagesByThread.has(msg.thread_id)) {
        messagesByThread.set(msg.thread_id, []);
      }
      messagesByThread.get(msg.thread_id)!.push(msg);
    });

    // Calculate response times: find homeowner reply → next estimator reply
    messagesByThread.forEach((threadMessages) => {
      for (let i = 0; i < threadMessages.length - 1; i++) {
        const current = threadMessages[i];
        const next = threadMessages[i + 1];

        if (current.direction === "in" && next.direction === "out") {
          const currentTime = new Date(current.sent_at || current.received_at || 0).getTime();
          const nextTime = new Date(next.sent_at || next.received_at || 0).getTime();
          const responseTimeSeconds = Math.floor((nextTime - currentTime) / 1000);
          if (responseTimeSeconds > 0 && responseTimeSeconds < 86400 * 30) { // Max 30 days
            responseTimes.push(responseTimeSeconds);
          }
        }
      }
    });

    const avg_response_time_seconds =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    // ============================================================================
    // 3. COMPUTE FOLLOW-UP COMPLETION RATE (tasks completed on time)
    // ============================================================================
    const { data: tasks, error: tasksError } = await supabase
      .from("smartsend_tasks")
      .select("id, completed, completed_at, due_at")
      .eq("user_id", input.estimator_id)
      .eq("workspace_id", input.workspace_id)
      .gte("due_at", input.period_start)
      .lte("due_at", input.period_end);

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      // Continue with null if tasks table doesn't exist or error
    }

    const totalTasks = (tasks || []).length;
    const completedOnTime =
      tasks?.filter(
        (t) =>
          t.completed &&
          t.completed_at &&
          t.due_at &&
          new Date(t.completed_at) <= new Date(t.due_at)
      ).length || 0;

    const follow_up_completion_rate =
      totalTasks > 0 ? Math.round((completedOnTime / totalTasks) * 10000) / 100 : null;

    // ============================================================================
    // 4. COMPUTE BOOKED ESTIMATE RATE (leads → scheduled estimates)
    // ============================================================================
    const { data: estimates, error: estimatesError } = await supabase
      .from("roof_estimates")
      .select("id, thread_id, status")
      .in("thread_id", threadIds)
      .eq("workspace_id", input.workspace_id)
      .gte("created_at", input.period_start)
      .lte("created_at", input.period_end);

    if (estimatesError) {
      console.error("Error fetching estimates:", estimatesError);
    }

    const totalLeads = threadIds.length;
    const bookedEstimates = (estimates || []).filter((e) => e.status === "sent" || e.status === "approved").length;
    const booked_estimate_rate =
      totalLeads > 0 ? Math.round((bookedEstimates / totalLeads) * 10000) / 100 : null;

    // ============================================================================
    // 5. COMPUTE PROPOSAL SENT RATE (estimates → proposals sent)
    // ============================================================================
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select("id, thread_id, status")
      .in("thread_id", threadIds)
      .eq("workspace_id", input.workspace_id)
      .gte("created_at", input.period_start)
      .lte("created_at", input.period_end);

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
    }

    const sentProposals = (proposals || []).filter((p) => p.status === "sent" || p.status === "approved" || p.status === "won").length;
    const proposal_sent_rate =
      bookedEstimates > 0 ? Math.round((sentProposals / bookedEstimates) * 10000) / 100 : null;

    // ============================================================================
    // 6. COMPUTE WIN RATE (proposals → won jobs)
    // ============================================================================
    const wonProposals = (proposals || []).filter((p) => p.status === "won").length;
    const win_rate =
      sentProposals > 0 ? Math.round((wonProposals / sentProposals) * 10000) / 100 : null;

    // ============================================================================
    // 7. COMPUTE JOB VALUE CREATED (from won jobs)
    // ============================================================================
    const { data: wonJobs, error: wonJobsError } = await supabase
      .from("won_jobs")
      .select("amount, lead_id")
      .eq("user_id", input.estimator_id)
      .gte("won_at", input.period_start)
      .lte("won_at", input.period_end);

    if (wonJobsError) {
      console.error("Error fetching won jobs:", wonJobsError);
    }

    const job_value_created =
      (wonJobs || []).reduce((sum, job) => sum + parseFloat(job.amount || 0), 0) || 0;

    // ============================================================================
    // 8. COMPUTE JOB VALUE LOST (leads with estimated_value but no win)
    // ============================================================================
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, estimated_value")
      .in("id", leadIds)
      .eq("workspace_id", input.workspace_id);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
    }

    const wonLeadIds = new Set(
      (wonJobs || []).map((job) => job.lead_id).filter(Boolean)
    );

    const job_value_lost =
      (leads || [])
        .filter((l) => !wonLeadIds.has(l.id) && l.estimated_value)
        .reduce((sum, l) => sum + parseFloat(l.estimated_value || 0), 0) || 0;

    // ============================================================================
    // 9. COMPUTE LEAD COVERAGE SCORE (% responded within 5 minutes)
    // ============================================================================
    const fastResponses = responseTimes.filter((rt) => rt < 300).length; // < 5 minutes
    const homeownerReplies = messages?.filter((m) => m.direction === "in").length || 0;
    const lead_coverage_score =
      homeownerReplies > 0
        ? Math.round((fastResponses / homeownerReplies) * 10000) / 100
        : null;

    // ============================================================================
    // 10. BUILD FINAL SCORE AND INSIGHT
    // ============================================================================
    const { final_letter_grade, insight } = buildScore(
      avg_response_time_seconds,
      follow_up_completion_rate,
      win_rate,
      lead_coverage_score
    );

    // ============================================================================
    // 11. INSERT/UPSERT SCORECARD
    // ============================================================================
    const scorecard: ScorecardMetrics & ScorecardInput = {
      estimator_id: input.estimator_id,
      workspace_id: input.workspace_id,
      period_start: input.period_start,
      period_end: input.period_end,
      avg_response_time_seconds,
      follow_up_completion_rate,
      booked_estimate_rate,
      proposal_sent_rate,
      win_rate,
      job_value_created,
      job_value_lost,
      lead_coverage_score,
      final_letter_grade,
      insight,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("estimator_scorecards")
      .upsert(scorecard, {
        onConflict: "estimator_id,workspace_id,period_start,period_end",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting scorecard:", insertError);
      throw insertError;
    }

    return new Response(JSON.stringify(inserted), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Estimator Scorecard] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildScore(
  responseTime: number | null,
  followUpRate: number | null,
  winRate: number | null,
  coverageScore: number | null
): { final_letter_grade: string; insight: string } {
  let score = 0;
  const maxScore = 100;

  // Response time (30 points): < 5 min = 30, < 1 hour = 20, < 24 hours = 10, else 0
  if (responseTime !== null) {
    if (responseTime < 300) score += 30; // < 5 minutes
    else if (responseTime < 3600) score += 20; // < 1 hour
    else if (responseTime < 86400) score += 10; // < 24 hours
  }

  // Follow-up completion (30 points): > 80% = 30, > 60% = 20, > 40% = 10, else 0
  if (followUpRate !== null) {
    if (followUpRate >= 80) score += 30;
    else if (followUpRate >= 60) score += 20;
    else if (followUpRate >= 40) score += 10;
  }

  // Win rate (40 points): > 30% = 40, > 20% = 30, > 10% = 20, else 0
  if (winRate !== null) {
    if (winRate >= 30) score += 40;
    else if (winRate >= 20) score += 30;
    else if (winRate >= 10) score += 20;
  }

  // Determine grade
  let grade = "F";
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 45) grade = "D";

  // Generate insight
  let insight = "";
  if (grade === "A") {
    insight = "Top performer — route high-value homeowners here.";
  } else if (grade === "B") {
    if (responseTime && responseTime > 3600) {
      insight = "Strong closer but slow response times. Route homeowner leads only during peak hours.";
    } else {
      insight = "Strong performer — tighten follow-up to increase revenue.";
    }
  } else if (grade === "C") {
    insight = "Inconsistent — needs training on follow-up timing.";
  } else if (grade === "D") {
    insight = "Leaks jobs. Follow-up rate under 40%. Needs training or replacement.";
  } else {
    insight = "Critical issues — leaking jobs due to slow response.";
  }

  return { final_letter_grade: grade, insight };
}

