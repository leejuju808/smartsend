// Block 21801 — SmartSend Roofing Job Probability Engine v1
// 📈 Predict the Likelihood of Winning Every Job
// Edge Function: Computes job win probability (0-100%) based on multiple factors

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    let score = 0;

    // ============================================================================
    // 1. HOMEOWNER BEHAVIOR SCORING
    // ============================================================================

    // Get homeowner replies from lead_activities (message_in kind)
    const { data: activities } = await supabase
      .from("lead_activities")
      .select("kind, created_at, body, meta")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true });

    const homeownerReplies = activities?.filter(a => a.kind === "message_in") || [];
    const replyCount = homeownerReplies.length;

    // Multiple replies
    if (replyCount >= 2) {
      score += 15;
    } else if (replyCount === 1) {
      score += 5;
    } else {
      score -= 15;
    }

    // Fast response time (<5 min)
    if (homeownerReplies.length > 0) {
      const firstReply = homeownerReplies[0];
      const responseTimeSeconds = firstReply.meta?.response_time_seconds;
      
      if (responseTimeSeconds && responseTimeSeconds <= 300) {
        score += 20;
      } else if (responseTimeSeconds && responseTimeSeconds <= 1800) {
        score += 10;
      }
    }

    // Positive intent keywords in message body
    const messageText = homeownerReplies
      .map(r => (r.body || "").toLowerCase())
      .join(" ");

    if (messageText.includes("asap") || messageText.includes("soon")) {
      score += 20;
    }
    if (messageText.includes("when can you") || messageText.includes("schedule")) {
      score += 25;
    }
    if (messageText.includes("shopping around") || messageText.includes("just looking")) {
      score -= 20;
    }

    // ============================================================================
    // 2. HEAT SCORE WEIGHTING
    // ============================================================================

    const heatScore = lead.heat_score || 0;
    if (heatScore >= 80) {
      score += 25;
    } else if (heatScore >= 50) {
      score += 15;
    } else if (heatScore < 0) {
      score -= 20;
    } else if (heatScore < 50) {
      score -= 10;
    }

    // ============================================================================
    // 3. ESTIMATOR PERFORMANCE SCORING
    // ============================================================================

    if (lead.estimator_id) {
      const { data: scorecard } = await supabase
        .from("estimator_scorecards")
        .select("final_letter_grade")
        .eq("estimator_id", lead.estimator_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (scorecard?.final_letter_grade) {
        const grade = scorecard.final_letter_grade;
        if (grade === "A") {
          score += 20;
        } else if (grade === "B") {
          score += 10;
        } else if (grade === "C") {
          score -= 5;
        } else if (grade === "D") {
          score -= 20;
        }
      }
    }

    // ============================================================================
    // 4. JOB TYPE SCORING
    // ============================================================================

    const jobType = (lead.job_type || "").toLowerCase();
    if (jobType === "emergency") {
      score += 20;
    } else if (jobType === "insurance") {
      score += 15;
    } else if (jobType === "replacement") {
      score += 10;
    } else if (jobType === "repair") {
      score += 5;
    }

    // ============================================================================
    // 5. FOLLOW-UP PATTERN SCORING
    // ============================================================================

    // Check for follow-up activities
    const followUpActivities = activities?.filter(a => 
      a.kind === "task_open" || a.kind === "task_done" || 
      a.title?.toLowerCase().includes("follow")
    ) || [];

    // Check for missed follow-ups (tasks that are overdue or incomplete)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("status, due_at, completed_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false });

    // Handle different status values: 'done', 'completed', 'open', 'in_progress', etc.
    const completedStatuses = ["done", "completed"];
    const missedFollowUps = tasks?.filter(t => 
      !completedStatuses.includes(t.status) && 
      t.due_at && 
      new Date(t.due_at) < new Date()
    ).length || 0;

    const completedFollowUps = tasks?.filter(t => 
      completedStatuses.includes(t.status)
    ).length || 0;

    if (missedFollowUps >= 1) {
      score -= 25;
    }
    if (completedFollowUps >= 2) {
      score += 10;
    }

    // Fast follow-up (<5 min) - check meta for response_time_seconds
    const fastFollowUps = activities?.filter(a => {
      const responseTime = a.meta?.response_time_seconds;
      return responseTime && responseTime <= 300;
    }).length || 0;

    if (fastFollowUps > 0) {
      score += 20;
    }

    // ============================================================================
    // 6. PROPOSAL TIMING SCORING
    // ============================================================================

    // Get threads for this lead
    const { data: threads } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("lead_id", lead_id)
      .limit(10);

    const threadIds = threads?.map(t => t.id) || [];

    if (threadIds.length > 0) {
      // Check for proposals sent via threads
      const { data: proposals } = await supabase
        .from("proposals")
        .select("sent_at, email_sent_at, created_at, status")
        .in("thread_id", threadIds)
        .in("status", ["sent", "approved", "won"])
        .order("created_at", { ascending: true })
        .limit(1);

      if (proposals && proposals.length > 0) {
        const firstProposal = proposals[0];
        const proposalSentAt = firstProposal.sent_at || 
                               firstProposal.email_sent_at || 
                               firstProposal.created_at;
        
        if (proposalSentAt) {
          const proposalSentTime = new Date(proposalSentAt);
          
          // Find when lead was created or first reply received
          const leadCreatedAt = new Date(lead.created_at);
          const firstReplyAt = homeownerReplies.length > 0 
            ? new Date(homeownerReplies[0].created_at)
            : null;

          const referenceTime = firstReplyAt || leadCreatedAt;
          const hoursSinceReference = (proposalSentTime.getTime() - referenceTime.getTime()) / (1000 * 60 * 60);

          if (hoursSinceReference <= 24) {
            score += 20;
          } else if (hoursSinceReference <= 72) {
            score += 10;
          } else {
            score -= 10;
          }
        }
      }
    }

    // ============================================================================
    // 7. CLAMP SCORE AND DETERMINE CATEGORY
    // ============================================================================

    if (score > 100) score = 100;
    if (score < -50) score = -50;

    const category =
      score >= 70 ? "high" :
      score >= 40 ? "medium" :
      score >= 0 ? "low" :
      "dead";

    // ============================================================================
    // 8. UPDATE LEAD WITH JOB PROBABILITY
    // ============================================================================

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        job_probability: score,
        job_probability_category: category,
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead job probability:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        score,
        category,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in compute-job-probability:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

